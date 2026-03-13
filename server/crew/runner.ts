import fs from 'fs'
import path from 'path'
import type { Response } from 'express'
import type { Agent } from '../../src/types/agent'
import type { RelationMode, MemberRelation } from '../../src/types/team'
import type { StreamChunk } from '../../src/types/task'
import type { ChatMessage } from '../llm/types'
import { llmRegistry } from '../llm/registry'
import {
  openAgentTerminal,
  writeToTerminal,
  writePhaseToTerminal,
  completeTerminal,
} from './agent-terminal'
import { FILE_TOOLS, executeFileTool, getFolderContext } from './file-tools'

/** Replace lone UTF-16 surrogates so JSON.stringify doesn't throw. */
function sanitizeSurrogates(str: string): string {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = str.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += str[i] + str[i + 1]
        i++
      } else {
        result += '\uFFFD'
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      result += '\uFFFD'
    } else {
      result += str[i]
    }
  }
  return result
}

function sendSSE(res: Response, data: unknown) {
  const safe = JSON.parse(JSON.stringify(data, (_key, val) =>
    typeof val === 'string' ? sanitizeSurrogates(val) : val
  ))
  res.write(`data: ${JSON.stringify(safe)}\n\n`)
}

/**
 * Run an agent with tool-use loop.
 * Agent can call file tools repeatedly until it finishes.
 */
async function runAgent(
  res: Response,
  taskId: string,
  agent: Agent,
  agentRole: 'leader' | 'member',
  phase: string,
  messages: ChatMessage[],
  useTerminal: boolean,
  outputDir?: string,
): Promise<string> {
  const provider = llmRegistry.getProvider(agent.llmConfig.provider)
  let fullOutput = ''
  const tools = outputDir ? FILE_TOOLS : undefined
  const conversationMessages = [...messages]

  if (useTerminal) writePhaseToTerminal(agent.id, phase)

  sendSSE(res, {
    type: 'stream',
    taskId, agentId: agent.id, agentName: agent.name, agentRole, phase, delta: '', done: false,
  } satisfies StreamChunk & { type: string })

  // Tool-use loop: keep calling LLM until no more tool calls
  const MAX_TOOL_ROUNDS = 40
  // Keep only the first message (system/user) + last N tool-exchange pairs to avoid context bloat
  const MAX_HISTORY_PAIRS = 8
  let agentDone = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Prune: keep initial messages + last MAX_HISTORY_PAIRS*2 messages (assistant + tool_result)
    if (conversationMessages.length > 2 + MAX_HISTORY_PAIRS * 2) {
      const head = conversationMessages.slice(0, 2)
      const tail = conversationMessages.slice(-(MAX_HISTORY_PAIRS * 2))
      conversationMessages.splice(0, conversationMessages.length, ...head, ...tail)
    }

    let roundText = ''
    const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

    console.log(`[runner] ${agent.name} round ${round + 1} start (msgs: ${conversationMessages.length})`)
    await provider.streamChat(conversationMessages, agent.llmConfig, (chunk) => {
      if (chunk.delta) {
        roundText += chunk.delta
        fullOutput += chunk.delta
        if (useTerminal) writeToTerminal(agent.id, chunk.delta)
        sendSSE(res, {
          type: 'stream',
          taskId, agentId: agent.id, agentName: agent.name, agentRole, phase,
          delta: chunk.delta, done: false,
        })
      }
      if (chunk.toolCall) {
        pendingToolCalls.push(chunk.toolCall)
      }
    }, tools)

    console.log(`[runner] ${agent.name} round ${round + 1} done, toolCalls: ${pendingToolCalls.length}`)

    // No tool calls — agent is done
    if (pendingToolCalls.length === 0) {
      agentDone = true
      sendSSE(res, {
        type: 'stream',
        taskId, agentId: agent.id, agentName: agent.name, agentRole, phase,
        delta: '', done: true,
      })
      break
    }

    // Build assistant message with text + tool_use blocks
    const assistantContent: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }> = []
    if (roundText) assistantContent.push({ type: 'text', text: sanitizeSurrogates(roundText) })
    for (const tc of pendingToolCalls) {
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }
    conversationMessages.push({
      role: 'assistant',
      content: JSON.stringify(assistantContent),
    })

    // Execute tools and build tool results
    const toolResults = await Promise.all(pendingToolCalls.map(async (tc) => {
      console.log(`[runner] executing tool: ${tc.name}`)
      const result = await executeFileTool(outputDir!, tc.name, tc.input)
      const statusText = result.isError ? '❌' : '✅'
      const logMsg = `\n${statusText} ${tc.name}(${JSON.stringify(tc.input).slice(0, 80)}) → ${result.content.slice(0, 100)}\n`
      if (useTerminal) writeToTerminal(agent.id, logMsg)
      fullOutput += logMsg
      sendSSE(res, {
        type: 'stream',
        taskId, agentId: agent.id, agentName: agent.name, agentRole, phase,
        delta: logMsg, done: false,
      })
      return {
        type: 'tool_result' as const,
        tool_use_id: tc.id,
        content: sanitizeSurrogates(result.content),
        is_error: result.isError,
      }
    }))

    conversationMessages.push({
      role: 'tool_result',
      content: toolResults,
    })
  }

  // MAX_TOOL_ROUNDS 초과 시에도 done 전송
  if (!agentDone) {
    sendSSE(res, {
      type: 'stream',
      taskId, agentId: agent.id, agentName: agent.name, agentRole, phase,
      delta: '', done: true,
    })
  }

  return fullOutput
}

function parsePlan(output: string, members: Agent[]): Array<{ agent: Agent; subtask: string }> {
  const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) ?? output.match(/\{[\s\S]*"subtasks"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as { subtasks?: Array<{ role?: string; agent?: string; task: string }> }
      if (parsed.subtasks?.length) {
        const assignments: Array<{ agent: Agent; subtask: string }> = []
        for (const subtask of parsed.subtasks) {
          const target = subtask.role ?? subtask.agent ?? ''
          const agent = members.find((m) =>
            m.role.toLowerCase().includes(target.toLowerCase()) ||
            m.name.toLowerCase().includes(target.toLowerCase())
          ) ?? members[assignments.length % members.length]
          if (agent) assignments.push({ agent, subtask: subtask.task })
        }
        return assignments
      }
    } catch { /* fallthrough */ }
  }
  return members.map((agent, i) => ({ agent, subtask: `Part ${i + 1}: ${output.slice(0, 200)}` }))
}

/** Parse supervisor instructions for hierarchical mode */
function parseSupervisorInstructions(output: string, subordinates: Agent[]): Array<{ agent: Agent; instruction: string }> {
  const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) ?? output.match(/\{[\s\S]*"instructions"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as { instructions?: Array<{ agent?: string; role?: string; task: string }> }
      if (parsed.instructions?.length) {
        const assignments: Array<{ agent: Agent; instruction: string }> = []
        for (const inst of parsed.instructions) {
          const target = inst.agent ?? inst.role ?? ''
          const agent = subordinates.find((m) =>
            m.role.toLowerCase().includes(target.toLowerCase()) ||
            m.name.toLowerCase().includes(target.toLowerCase())
          ) ?? subordinates[assignments.length % subordinates.length]
          if (agent) assignments.push({ agent, instruction: inst.task })
        }
        return assignments
      }
    } catch { /* fallthrough */ }
  }
  return subordinates.map((agent, i) => ({ agent, instruction: `Task ${i + 1}: ${output.slice(0, 200)}` }))
}

function saveResultMd(
  outputDir: string,
  prompt: string,
  leader: Agent,
  memberOutputs: Array<{ agent: Agent; subtask: string; output: string }>,
  finalResult: string,
): string {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName = prompt.slice(0, 40).replace(/[<>:"/\\|?*\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim()
  const filePath = path.join(outputDir, `${timestamp}_${safeName}.md`)

  const team = [leader.name, ...memberOutputs.map(m => m.agent.name)].join(', ')
  const parts: string[] = [
    `# ${prompt}`,
    `> ${new Date().toLocaleString('ko-KR')} | ${team}`,
  ]
  if (memberOutputs.length > 0) {
    for (const m of memberOutputs) {
      parts.push(`\n## ${m.agent.name}`, `_${m.subtask.slice(0, 120)}_`, m.output.trim())
    }
    parts.push(`\n## 최종`, finalResult.trim())
  } else {
    parts.push('', finalResult.trim())
  }
  fs.writeFileSync(filePath, parts.join('\n'), 'utf-8')
  return filePath
}

// ── Execution group types ──────────────────────────────────

interface SoloGroup {
  mode: 'solo'
  agents: Agent[]
}

interface CollaborateGroup {
  mode: 'collaborate'
  agents: Agent[]
}

interface HierarchicalGroup {
  mode: 'hierarchical'
  supervisor: Agent
  subordinates: Agent[]
}

type ExecutionGroup = SoloGroup | CollaborateGroup | HierarchicalGroup

/**
 * Group members by their pairwise relations using union-find for collaborate
 * and direct edges for hierarchical.
 */
function groupByMode(members: Agent[], defaultMode: RelationMode, relations: MemberRelation[]): ExecutionGroup[] {
  const memberMap = new Map(members.map(m => [m.id, m]))
  const memberIds = new Set(members.map(m => m.id))

  // Build relation lookup: key = "fromId:toId" (sorted for undirected)
  const pairMode = new Map<string, MemberRelation>()
  for (const rel of relations) {
    if (memberIds.has(rel.fromId) && memberIds.has(rel.toId)) {
      pairMode.set(`${rel.fromId}:${rel.toId}`, rel)
    }
  }

  // Union-Find for collaborate groups
  const parent = new Map<string, string>()
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  // Track hierarchical edges
  const hierEdges: Array<{ fromId: string; toId: string }> = []
  const inHierarchy = new Set<string>()

  // Classify each relation
  for (const rel of relations) {
    if (!memberIds.has(rel.fromId) || !memberIds.has(rel.toId)) continue
    if (rel.mode === 'collaborate') {
      union(rel.fromId, rel.toId)
    } else if (rel.mode === 'hierarchical') {
      hierEdges.push({ fromId: rel.fromId, toId: rel.toId })
      inHierarchy.add(rel.fromId)
      inHierarchy.add(rel.toId)
    }
  }

  // Build collaborate groups
  const collabGroups = new Map<string, Set<string>>()
  const inCollab = new Set<string>()
  for (const id of memberIds) {
    // Check if this agent has any collaborate relation
    const hasCollabRelation = relations.some(r =>
      r.mode === 'collaborate' && (r.fromId === id || r.toId === id) &&
      memberIds.has(r.fromId) && memberIds.has(r.toId)
    )
    if (hasCollabRelation) {
      const root = find(id)
      if (!collabGroups.has(root)) collabGroups.set(root, new Set())
      collabGroups.get(root)!.add(id)
      inCollab.add(id)
    }
  }

  // Build hierarchical groups: group by supervisor
  const hierGroups = new Map<string, Set<string>>()
  for (const edge of hierEdges) {
    if (!hierGroups.has(edge.fromId)) hierGroups.set(edge.fromId, new Set())
    hierGroups.get(edge.fromId)!.add(edge.toId)
  }

  const assigned = new Set<string>()
  const groups: ExecutionGroup[] = []

  // Add collaborate groups
  for (const [, agentIds] of collabGroups) {
    const agents = [...agentIds].map(id => memberMap.get(id)!).filter(Boolean)
    if (agents.length > 0) {
      groups.push({ mode: 'collaborate', agents })
      for (const id of agentIds) assigned.add(id)
    }
  }

  // Add hierarchical groups
  for (const [supId, subIds] of hierGroups) {
    if (assigned.has(supId)) continue
    const supervisor = memberMap.get(supId)
    const subordinates = [...subIds].filter(id => !assigned.has(id)).map(id => memberMap.get(id)!).filter(Boolean)
    if (supervisor && subordinates.length > 0) {
      groups.push({ mode: 'hierarchical', supervisor, subordinates })
      assigned.add(supId)
      for (const id of subIds) assigned.add(id)
    }
  }

  // Remaining agents: use defaultMode
  const remaining = members.filter(m => !assigned.has(m.id))
  if (remaining.length > 0) {
    if (defaultMode === 'collaborate' && remaining.length > 1) {
      groups.push({ mode: 'collaborate', agents: remaining })
    } else if (defaultMode === 'hierarchical' && remaining.length > 1) {
      // First remaining agent is supervisor
      groups.push({ mode: 'hierarchical', supervisor: remaining[0], subordinates: remaining.slice(1) })
    } else {
      groups.push({ mode: 'solo', agents: remaining })
    }
  }

  return groups
}

// ── Solo execution ─────────────────────────────────────────

async function executeSolo(
  res: Response,
  taskId: string,
  agents: Agent[],
  assignments: Array<{ agent: Agent; subtask: string }>,
  useTerminal: boolean,
  outputDir?: string,
): Promise<Array<{ agent: Agent; subtask: string; output: string }>> {
  const results: Array<{ agent: Agent; subtask: string; output: string }> = []
  await Promise.all(
    assignments.filter(a => agents.some(ag => ag.id === a.agent.id)).map(async ({ agent, subtask }) => {
      const memberCtx = outputDir ? `\n\n프로젝트 폴더: ${outputDir}\n파일 도구를 사용하여 실제 파일을 읽고 수정할 수 있습니다.` : ''
      const output = await runAgent(res, taskId, agent, 'member', 'executing', [
        { role: 'system', content: agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 한국어로 응답하세요.` },
        { role: 'user', content: subtask + memberCtx },
      ], useTerminal, outputDir)
      results.push({ agent, subtask, output })
    })
  )
  return results
}

// ── Collaborate execution (discussion rounds) ──────────────

async function executeCollaborate(
  res: Response,
  taskId: string,
  agents: Agent[],
  leaderPlan: string,
  prompt: string,
  useTerminal: boolean,
  outputDir?: string,
): Promise<Array<{ agent: Agent; subtask: string; output: string }>> {
  const MAX_DISCUSSION_ROUNDS = 3
  let previousOpinions = ''

  // Discussion rounds
  for (let round = 0; round < MAX_DISCUSSION_ROUNDS; round++) {
    console.log(`[runner] Discussion round ${round + 1}/${MAX_DISCUSSION_ROUNDS}`)

    sendSSE(res, {
      type: 'discussion',
      taskId,
      round: round + 1,
      maxRounds: MAX_DISCUSSION_ROUNDS,
      status: 'started',
    })

    const opinions: Array<{ agent: Agent; opinion: string }> = []
    await Promise.all(
      agents.map(async (agent) => {
        const discussPrompt = round === 0
          ? `당신은 ${agent.name} (${agent.role})입니다.\n\n팀 과제: "${prompt}"\n\n리더의 계획:\n${leaderPlan}\n\n이 계획에 대한 의견을 200자 이내로 짧게 제시하세요.\n동의하면 반드시 [AGREE]를, 수정이 필요하면 [DISAGREE]를 의견 맨 앞에 붙여주세요.${previousOpinions}`
          : `당신은 ${agent.name} (${agent.role})입니다.\n\n팀 과제: "${prompt}"\n\n리더의 계획:\n${leaderPlan}\n\n이전 라운드 팀원 의견:\n${previousOpinions}\n\n이 논의를 바탕으로 수정된 의견을 200자 이내로 제시하세요.\n동의하면 [AGREE]를, 수정이 필요하면 [DISAGREE]를 의견 맨 앞에 붙여주세요.`

        const opinion = await runAgent(res, taskId, agent, 'member', 'discussing', [
          { role: 'system', content: agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 한국어로 응답하세요.` },
          { role: 'user', content: discussPrompt },
        ], useTerminal)
        opinions.push({ agent, opinion })
      })
    )

    // Check if all agree
    const allAgree = opinions.every(o => o.opinion.includes('[AGREE]'))

    sendSSE(res, {
      type: 'discussion',
      taskId,
      round: round + 1,
      maxRounds: MAX_DISCUSSION_ROUNDS,
      status: allAgree ? 'agreed' : 'continuing',
      opinions: opinions.map(o => ({ agentId: o.agent.id, agentName: o.agent.name, agreed: o.opinion.includes('[AGREE]') })),
    })

    if (allAgree) {
      console.log(`[runner] All members agreed at round ${round + 1}`)
      break
    }

    // Build opinions summary for next round
    previousOpinions = '\n\n--- 팀원 의견 (라운드 ' + (round + 1) + ') ---\n' +
      opinions.map(o => `${o.agent.name}: ${o.opinion.slice(0, 200)}`).join('\n')
  }

  // After discussion, execute with the refined plan
  const results: Array<{ agent: Agent; subtask: string; output: string }> = []
  const discussionCtx = previousOpinions ? `\n\n논의 결과를 반영하여 작업을 수행하세요.\n${previousOpinions}` : ''

  await Promise.all(
    agents.map(async (agent) => {
      const memberCtx = outputDir ? `\n\n프로젝트 폴더: ${outputDir}\n파일 도구를 사용하여 실제 파일을 읽고 수정할 수 있습니다.` : ''
      const execPrompt = `당신은 ${agent.name} (${agent.role})입니다.\n\n팀 과제: "${prompt}"\n\n리더의 계획:\n${leaderPlan}${discussionCtx}\n\n당신의 역할에 맞는 부분을 수행하세요.${memberCtx}`

      const output = await runAgent(res, taskId, agent, 'member', 'executing', [
        { role: 'system', content: agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 한국어로 응답하세요.` },
        { role: 'user', content: execPrompt },
      ], useTerminal, outputDir)
      results.push({ agent, subtask: `[collaborate] ${agent.role} part`, output })
    })
  )

  return results
}

// ── Hierarchical execution ─────────────────────────────────

async function executeHierarchical(
  res: Response,
  taskId: string,
  supervisor: Agent,
  subordinates: Agent[],
  leaderPlan: string,
  prompt: string,
  useTerminal: boolean,
  outputDir?: string,
): Promise<Array<{ agent: Agent; subtask: string; output: string }>> {
  const subList = subordinates.map(s => `- ${s.name} (${s.role})`).join('\n')
  const memberCtx = outputDir ? `\n\n프로젝트 폴더: ${outputDir}\n파일 도구를 사용하여 실제 파일을 읽고 수정할 수 있습니다.` : ''

  // Supervisor creates specific instructions for subordinates
  const instructionPrompt = `당신은 ${supervisor.name} (${supervisor.role}), 팀의 상사입니다.\n\n팀 과제: "${prompt}"\n\n리더의 전체 계획:\n${leaderPlan}\n\n부하 팀원:\n${subList}\n\n각 부하에게 구체적인 지시를 내려주세요. 다음 JSON 형식으로 출력:\n\`\`\`json\n{"instructions": [{"agent": "<부하 이름>", "task": "<구체적 지시>"}]}\n\`\`\`${memberCtx}`

  const supervisorOutput = await runAgent(res, taskId, supervisor, 'member', 'executing', [
    { role: 'system', content: supervisor.systemPrompt || `You are ${supervisor.name}, a ${supervisor.role}. 한국어로 응답하세요.` },
    { role: 'user', content: instructionPrompt },
  ], useTerminal, outputDir)

  // Parse supervisor instructions and assign to subordinates
  const instructions = parseSupervisorInstructions(supervisorOutput, subordinates)
  const subResults: Array<{ agent: Agent; subtask: string; output: string }> = []

  // Subordinates execute in parallel
  await Promise.all(
    instructions.map(async ({ agent, instruction }) => {
      const subPrompt = `당신은 ${agent.name} (${agent.role})입니다.\n상사 ${supervisor.name}의 지시:\n\n${instruction}${memberCtx}`
      const output = await runAgent(res, taskId, agent, 'member', 'executing', [
        { role: 'system', content: agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 한국어로 응답하세요.` },
        { role: 'user', content: subPrompt },
      ], useTerminal, outputDir)
      subResults.push({ agent, subtask: instruction, output })
    })
  )

  // Supervisor reviews results
  const reviewSummaries = subResults.map(r =>
    `## ${r.agent.name}\n지시: ${r.subtask.slice(0, 200)}\n결과:\n${r.output}`
  ).join('\n\n---\n\n')

  const reviewPrompt = `당신은 ${supervisor.name} (${supervisor.role}), 팀의 상사입니다.\n\n원래 과제: "${prompt}"\n\n부하들의 작업 결과:\n${reviewSummaries}\n\n결과를 검토하고 종합하세요.${memberCtx}`

  const reviewOutput = await runAgent(res, taskId, supervisor, 'member', 'synthesizing', [
    { role: 'system', content: supervisor.systemPrompt || `You are ${supervisor.name}, a ${supervisor.role}. 한국어로 응답하세요.` },
    { role: 'user', content: reviewPrompt },
  ], useTerminal, outputDir)

  return [
    { agent: supervisor, subtask: '[supervisor] 지시 및 검토', output: reviewOutput },
    ...subResults,
  ]
}

// ── Main entry point ───────────────────────────────────────

export async function runCrew(
  res: Response,
  taskId: string,
  leader: Agent,
  members: Agent[],
  prompt: string,
  openTerminals = false,
  outputDir?: string,
  defaultMode: RelationMode = 'solo',
  relations: MemberRelation[] = [],
) {
  try {
    if (openTerminals) {
      openAgentTerminal(leader.id, leader.name, 'leader')
      for (const m of members) openAgentTerminal(m.id, m.name, 'member')
    }

    // Build folder context if outputDir is set
    const folderCtx = outputDir ? `\n\n--- 프로젝트 폴더 구조 ---\n${getFolderContext(outputDir)}\n---\n\n파일을 읽고, 수정하고, 생성할 수 있는 도구가 제공됩니다. 필요하면 적극적으로 사용하세요.` : ''

    // Phase 1: Leader plans
    const allRoles = members.map((m) => `- ${m.name} (${m.role})`).join('\n')
    const planPrompt = members.length > 0
      ? `You are ${leader.name}, a ${leader.role} and team leader.\nYour team:\n${allRoles}\n\nTask: "${prompt}"${folderCtx}\n\nCreate a plan. Output subtasks in:\n\`\`\`json\n{"subtasks": [{"role": "<member role>", "task": "<description>"}]}\n\`\`\`\nThen write your analysis.`
      : `You are ${leader.name}, a ${leader.role}.\nComplete this task: "${prompt}"${folderCtx}`

    const leaderOutput = await runAgent(res, taskId, leader, 'leader', 'planning', [
      { role: 'system', content: leader.systemPrompt || `You are ${leader.name}, a ${leader.role}. 한국어로 응답하세요.` },
      { role: 'user', content: planPrompt },
    ], openTerminals, outputDir)

    if (members.length > 0) {
      const assignments = parsePlan(leaderOutput, members)

      // Group members by execution mode
      const groups = groupByMode(members, defaultMode, relations)
      const allResults: Array<{ agent: Agent; subtask: string; output: string }> = []

      // Execute all groups in parallel
      await Promise.all(groups.map(async (group) => {
        switch (group.mode) {
          case 'solo': {
            const results = await executeSolo(res, taskId, group.agents, assignments, openTerminals, outputDir)
            allResults.push(...results)
            break
          }
          case 'collaborate': {
            const results = await executeCollaborate(res, taskId, group.agents, leaderOutput, prompt, openTerminals, outputDir)
            allResults.push(...results)
            break
          }
          case 'hierarchical': {
            const results = await executeHierarchical(res, taskId, group.supervisor, group.subordinates, leaderOutput, prompt, openTerminals, outputDir)
            allResults.push(...results)
            break
          }
        }
      }))

      // Phase 3: Leader synthesizes
      const summaries = allResults.map((r) =>
        `## ${r.agent.name} (${r.agent.role})\nTask: ${r.subtask}\n\nResult:\n${r.output}`
      ).join('\n\n---\n\n')

      const finalOutput = await runAgent(res, taskId, leader, 'leader', 'synthesizing', [
        { role: 'system', content: leader.systemPrompt || `You are ${leader.name}, a ${leader.role}. 한국어로 응답하세요.` },
        { role: 'user', content: `Original task: "${prompt}"\n\nTeam outputs:\n${summaries}\n\nSynthesize a final answer.` },
      ], openTerminals, outputDir)

      if (openTerminals) {
        completeTerminal(leader.id)
        for (const m of members) completeTerminal(m.id)
      }

      let savedPath: string | undefined
      if (outputDir) savedPath = saveResultMd(outputDir, prompt, leader, allResults, finalOutput)
      sendSSE(res, { type: 'complete', taskId, content: finalOutput, savedPath, completedAt: Date.now() })
    } else {
      if (openTerminals) completeTerminal(leader.id)
      let savedPath: string | undefined
      if (outputDir) savedPath = saveResultMd(outputDir, prompt, leader, [], leaderOutput)
      sendSSE(res, { type: 'complete', taskId, content: leaderOutput, savedPath, completedAt: Date.now() })
    }
  } catch (err) {
    sendSSE(res, { type: 'error', taskId, message: (err as Error).message })
  } finally {
    res.end()
  }
}

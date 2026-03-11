import fs from 'fs'
import path from 'path'
import type { Response } from 'express'
import type { Agent } from '../../src/types/agent'
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

function sendSSE(res: Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
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
  const MAX_TOOL_ROUNDS = 20
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let roundText = ''
    const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

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

    // No tool calls — agent is done
    if (pendingToolCalls.length === 0) {
      sendSSE(res, {
        type: 'stream',
        taskId, agentId: agent.id, agentName: agent.name, agentRole, phase,
        delta: '', done: true,
      })
      break
    }

    // Build assistant message with text + tool_use blocks
    const assistantContent: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }> = []
    if (roundText) assistantContent.push({ type: 'text', text: roundText })
    for (const tc of pendingToolCalls) {
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }
    conversationMessages.push({
      role: 'assistant',
      content: JSON.stringify(assistantContent),
    })

    // Execute tools and build tool results
    const toolResults = pendingToolCalls.map((tc) => {
      const result = executeFileTool(outputDir!, tc.name, tc.input)
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
        content: result.content,
        is_error: result.isError,
      }
    })

    conversationMessages.push({
      role: 'tool_result',
      content: toolResults,
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

function saveResultMd(
  outputDir: string,
  prompt: string,
  leader: Agent,
  memberOutputs: Array<{ agent: Agent; subtask: string; output: string }>,
  finalResult: string,
): string {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName = prompt.slice(0, 40).replace(/[<>:"/\\|?*]/g, '').trim()
  const filePath = path.join(outputDir, `${timestamp}_${safeName}.md`)

  const lines: string[] = [
    `# ${prompt}`, '',
    `> ${new Date().toLocaleString('ko-KR')}`, '',
    `## 팀 구성`,
    `- **리더**: ${leader.name} (${leader.role})`,
    ...memberOutputs.map(m => `- **멤버**: ${m.agent.name} (${m.agent.role})`), '',
  ]
  if (memberOutputs.length > 0) {
    lines.push('## 에이전트별 결과', '')
    for (const m of memberOutputs) {
      lines.push(`### ${m.agent.name} (${m.agent.role})`, '', `**태스크**: ${m.subtask}`, '', m.output, '', '---', '')
    }
  }
  lines.push('## 최종 결과', '', finalResult, '')
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
  return filePath
}

export async function runCrew(
  res: Response,
  taskId: string,
  leader: Agent,
  members: Agent[],
  prompt: string,
  openTerminals = false,
  outputDir?: string,
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
      const results: Array<{ agent: Agent; subtask: string; output: string }> = []

      await Promise.all(
        assignments.map(async ({ agent, subtask }) => {
          const memberCtx = outputDir ? `\n\n프로젝트 폴더: ${outputDir}\n파일 도구를 사용하여 실제 파일을 읽고 수정할 수 있습니다.` : ''
          const output = await runAgent(res, taskId, agent, 'member', 'executing', [
            { role: 'system', content: agent.systemPrompt || `You are ${agent.name}, a ${agent.role}. 한국어로 응답하세요.` },
            { role: 'user', content: subtask + memberCtx },
          ], openTerminals, outputDir)
          results.push({ agent, subtask, output })
        })
      )

      // Phase 3: Leader synthesizes
      const summaries = results.map((r) =>
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
      if (outputDir) savedPath = saveResultMd(outputDir, prompt, leader, results, finalOutput)
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

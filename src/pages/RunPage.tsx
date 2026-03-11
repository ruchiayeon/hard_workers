import { useState, useEffect, useCallback, useRef } from 'react'
import type { Agent } from '../types/agent'
import type { Team } from '../types/team'
import AgentCard from '../components/agent/AgentCard'
import type { AgentCardStatus } from '../components/agent/AgentCard'
import { api } from '../api'

interface AgentOutput {
  agentId: string
  agentName: string
  role: 'leader' | 'member'
  phase?: string
  text: string
  status: AgentCardStatus
}

export default function RunPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [outputs, setOutputs] = useState<Map<string, AgentOutput>>(new Map())
  const [finalResult, setFinalResult] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openTerminals, setOpenTerminals] = useState(false)
  const outputRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const load = useCallback(async () => {
    const [t, a] = await Promise.all([api.team.list(), api.agent.list()])
    setTeams(t)
    setAgents(a)
    if (t.length > 0 && !selectedTeamId) setSelectedTeamId(t[0].id)
  }, [selectedTeamId])

  useEffect(() => { load() }, [load])

  const handleRun = async () => {
    if (!selectedTeamId || !prompt.trim() || isRunning) return
    setIsRunning(true)
    setOutputs(new Map())
    setFinalResult(null)
    setSavedPath(null)
    setError(null)

    try {
      const response = await api.task.run({ teamId: selectedTeamId, prompt: prompt.trim(), openTerminals })
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'stream') {
                setOutputs((prev) => {
                  const next = new Map(prev)
                  const existing = next.get(data.agentId)
                  next.set(data.agentId, {
                    agentId: data.agentId,
                    agentName: data.agentName,
                    role: data.agentRole,
                    phase: data.phase,
                    text: (existing?.text ?? '') + data.delta,
                    status: data.done ? 'done' : 'thinking',
                  })
                  return next
                })
                const el = outputRefs.current.get(data.agentId)
                if (el) el.scrollTop = el.scrollHeight
              } else if (data.type === 'complete') {
                setFinalResult(data.content)
                if (data.savedPath) setSavedPath(data.savedPath)
                setIsRunning(false)
              } else if (data.type === 'error') {
                setError(data.message)
                setIsRunning(false)
              }
            } catch { /* skip bad JSON */ }
          }
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRunning(false)
    }
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)
  const teamLeader = agents.find((a) => a.id === selectedTeam?.leaderId)
  const teamMembers = selectedTeam?.memberIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean) as Agent[] | undefined

  const phaseLabels: Record<string, string> = {
    planning: '🗺️ 계획 수립 중',
    executing: '⚡ 작업 실행 중',
    synthesizing: '🔗 결과 종합 중',
  }

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      <h1 className="text-2xl font-bold text-white font-game mb-1">미션 실행</h1>
      <p className="text-gray-500 text-sm mb-4">팀을 선택하고 미션을 입력하여 실행합니다</p>

      <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
        {teams.map((team) => (
          <button key={team.id} onClick={() => setSelectedTeamId(team.id)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all border ${
              selectedTeamId === team.id ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-400' : 'border-game-border text-gray-400 hover:border-gray-500'
            }`}>
            {team.name}
          </button>
        ))}
        {teams.length === 0 && <div className="text-gray-500 text-sm">팀을 먼저 구성해주세요</div>}
      </div>

      {selectedTeam && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {teamLeader && <AgentCard agent={teamLeader} size="sm" isLeader selected status={outputs.get(teamLeader.id)?.status} />}
          {teamMembers?.map((m) => <AgentCard key={m.id} agent={m} size="sm" selected status={outputs.get(m.id)?.status} />)}
        </div>
      )}

      {/* Output dir & options */}
      {selectedTeam && (
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">저장 폴더</span>
            {selectedTeam.outputDir ? (
              <div className="flex items-center gap-2">
                <span className="text-yellow-400/80 text-xs bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded font-mono truncate max-w-[300px]" title={selectedTeam.outputDir}>
                  {selectedTeam.outputDir}
                </span>
                <button
                  onClick={async () => {
                    const result = await api.team.setOutputDir(selectedTeam.id)
                    if (!('cancelled' in result)) load()
                  }}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                  title="변경"
                >변경</button>
                <button
                  onClick={async () => { await api.team.clearOutputDir(selectedTeam.id); load() }}
                  className="text-gray-500 hover:text-red-400 text-xs"
                  title="해제"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  const result = await api.team.setOutputDir(selectedTeam.id)
                  if (!('cancelled' in result)) load()
                }}
                className="btn-secondary text-xs py-0.5 px-2"
              >
                폴더 선택
              </button>
            )}
          </div>

          <span className="text-game-border">|</span>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={openTerminals}
              onChange={(e) => setOpenTerminals(e.target.checked)}
              className="w-4 h-4 accent-yellow-400"
            />
            <span className="text-gray-400 text-xs">에이전트별 터미널</span>
          </label>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <textarea className="input-field flex-1 min-h-[60px] max-h-[120px] resize-y" value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="미션을 입력하세요... (예: 한국 AI 시장 분석 보고서를 작성해줘)"
          disabled={isRunning}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleRun() }} />
        <button onClick={handleRun} disabled={isRunning || !selectedTeamId || !prompt.trim()} className="btn-primary h-fit self-end disabled:opacity-40">
          {isRunning ? <span className="flex items-center gap-2"><span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />실행 중</span> : '▶ 실행'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {error && <div className="card-frame border-red-500/40 p-4 text-red-400 text-sm">⚠ 오류: {error}</div>}

        {Array.from(outputs.values()).map((output) => (
          <div key={output.agentId} className="card-frame p-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <span className={output.role === 'leader' ? 'text-yellow-400' : 'text-blue-400'}>{output.role === 'leader' ? '👑' : '⚔'}</span>
              <span className="text-white font-semibold text-sm">{output.agentName}</span>
              {output.phase && <span className="text-gray-500 text-xs">{phaseLabels[output.phase] ?? output.phase}</span>}
              {output.status === 'thinking' && <span className="flex items-center gap-0.5 ml-auto"><span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" /></span>}
              {output.status === 'done' && <span className="text-green-400 text-xs ml-auto">완료</span>}
            </div>
            <div ref={(el) => { if (el) outputRefs.current.set(output.agentId, el) }}
              className="bg-game-bg rounded p-3 max-h-[300px] overflow-y-auto text-gray-300 text-sm whitespace-pre-wrap leading-relaxed font-mono">
              {output.text || <span className="text-gray-600">대기 중...</span>}
            </div>
          </div>
        ))}

        {finalResult && (
          <div className="card-frame border-yellow-400/30 p-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-yellow-400">🏆</span>
              <span className="text-yellow-400 font-semibold text-sm">최종 결과</span>
            </div>
            <div className="bg-game-bg rounded p-3 text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{finalResult}</div>
            {savedPath && (
              <div className="mt-2 text-xs text-gray-500">
                저장됨: <span className="text-yellow-400/70 font-mono">{savedPath}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

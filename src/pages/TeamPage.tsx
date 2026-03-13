import { useState, useEffect, useCallback } from 'react'
import type { Agent } from '../types/agent'
import type { Team, RelationMode, MemberRelation } from '../types/team'
import AgentCard from '../components/agent/AgentCard'
import RelationEditor from '../components/team/RelationEditor'
import { api } from '../api'

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [leaderId, setLeaderId] = useState<string | null>(null)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [defaultMode, setDefaultMode] = useState<RelationMode>('solo')
  const [relations, setRelations] = useState<MemberRelation[]>([])
  const [showRelationEditor, setShowRelationEditor] = useState(false)

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      api.agent.list(),
      api.team.list(),
    ])
    setAgents(a)
    setTeams(t)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAgentClick = (agentId: string) => {
    if (!leaderId) {
      setLeaderId(agentId)
    } else if (agentId === leaderId) {
      setLeaderId(null)
    } else if (memberIds.includes(agentId)) {
      setMemberIds(memberIds.filter((id) => id !== agentId))
    } else if (memberIds.length < 5) {
      setMemberIds([...memberIds, agentId])
    }
  }

  const handleSave = async () => {
    if (!leaderId || !teamName.trim()) return
    await api.team.save({
      id: editingTeamId ?? undefined,
      name: teamName.trim(),
      description: teamDesc.trim() || undefined,
      leaderId,
      memberIds,
      outputDir: outputDir ?? undefined,
      defaultMode,
      relations,
    })
    resetForm()
    load()
  }

  const handleEditTeam = (team: Team) => {
    setEditingTeamId(team.id)
    setTeamName(team.name)
    setTeamDesc(team.description ?? '')
    setLeaderId(team.leaderId)
    setMemberIds(team.memberIds)
    setOutputDir(team.outputDir ?? null)
    setDefaultMode(team.defaultMode ?? 'solo')
    setRelations(team.relations ?? [])
  }

  const handleDeleteTeam = async (team: Team) => {
    if (!confirm(`"${team.name}" 팀을 삭제하시겠습니까?`)) return
    await api.team.delete(team.id)
    load()
  }

  const handlePickOutputDir = async () => {
    const result = await api.workspace.pick()
    if (result.path) setOutputDir(result.path)
  }

  const resetForm = () => {
    setEditingTeamId(null)
    setTeamName('')
    setTeamDesc('')
    setLeaderId(null)
    setMemberIds([])
    setOutputDir(null)
    setDefaultMode('solo')
    setRelations([])
  }

  const leader = agents.find((a) => a.id === leaderId)
  const members = agents.filter((a) => memberIds.includes(a.id))

  return (
    <div className="p-6 h-full overflow-y-auto">
      <h1 className="text-2xl font-bold text-white font-game mb-1">팀 구성</h1>
      <p className="text-gray-500 text-sm mb-6">게임처럼 팀장과 팀원을 선택하여 파티를 구성합니다</p>

      <div className="grid grid-cols-[1fr_320px] gap-6 h-[calc(100%-80px)]">
        {/* Left: Agent selection grid */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            캐릭터 선택 <span className="text-gray-600">(클릭: 팀장 → 팀원)</span>
          </h3>

          {agents.length === 0 ? (
            <div className="text-gray-500 text-center py-12">
              먼저 에이전트를 만들어주세요
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  size="sm"
                  selected={agent.id === leaderId || memberIds.includes(agent.id)}
                  isLeader={agent.id === leaderId}
                  onClick={() => handleAgentClick(agent.id)}
                />
              ))}
            </div>
          )}

          {/* Saved teams */}
          {teams.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">저장된 팀</h3>
              <div className="grid grid-cols-2 gap-3">
                {teams.map((team) => {
                  const tLeader = agents.find((a) => a.id === team.leaderId)
                  return (
                    <div
                      key={team.id}
                      className="card-frame p-3 cursor-pointer hover:border-yellow-400/30 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-semibold text-sm">{team.name}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditTeam(team)}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >✏</button>
                          <button
                            onClick={() => handleDeleteTeam(team)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >🗑</button>
                        </div>
                      </div>
                      <div className="text-gray-500 text-xs flex items-center gap-2">
                        <span>👑 {tLeader?.name ?? '?'} + {team.memberIds.length}명</span>
                        {team.defaultMode && team.defaultMode !== 'solo' && (
                          <span className={`text-[10px] px-1 rounded ${
                            team.defaultMode === 'collaborate' ? 'bg-blue-400/20 text-blue-400' : 'bg-purple-400/20 text-purple-400'
                          }`}>
                            {team.defaultMode === 'collaborate' ? '🤝' : '👑→⚔'}
                          </span>
                        )}
                      </div>
                      {team.description && (
                        <div className="text-gray-600 text-xs mt-1 truncate">{team.description}</div>
                      )}
                      {team.outputDir && (
                        <div className="text-yellow-400/50 text-xs mt-1 truncate font-mono" title={team.outputDir}>📁 {team.outputDir}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Team formation panel */}
        <div className="card-frame p-4 h-fit sticky top-0">
          <h3 className="font-pixel text-yellow-400 text-xs mb-4">PARTY FORMATION</h3>

          {/* Team name */}
          <div className="mb-4">
            <label className="label">팀 이름</label>
            <input
              className="input-field"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="예: 분석 팀"
            />
          </div>
          <div className="mb-4">
            <label className="label">설명 (선택)</label>
            <input
              className="input-field"
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              placeholder="팀의 목적을 간략히 설명"
            />
          </div>

          {/* Leader slot */}
          <div className="mb-4">
            <label className="label">👑 팀장 (Leader)</label>
            <div className="border-2 border-dashed border-yellow-400/30 rounded-lg min-h-[140px] flex items-center justify-center">
              {leader ? (
                <AgentCard agent={leader} size="sm" selected isLeader />
              ) : (
                <span className="text-gray-600 text-sm">에이전트를 클릭하세요</span>
              )}
            </div>
          </div>

          {/* Member slots */}
          <div className="mb-4">
            <label className="label">⚔ 팀원 (Members) {memberIds.length}/5</label>
            <div className="border-2 border-dashed border-blue-400/20 rounded-lg min-h-[100px] p-2">
              {members.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <AgentCard key={m.id} agent={m} size="sm" selected />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-20 text-gray-600 text-sm">
                  팀장 선택 후 팀원을 클릭하세요
                </div>
              )}
            </div>
          </div>

          {/* Relation Mode */}
          <div className="mb-4">
            <label className="label">협업 모드</label>
            <div className="flex gap-1">
              {([
                { mode: 'solo' as RelationMode, icon: '🗡️', label: '개인플레이' },
                { mode: 'collaborate' as RelationMode, icon: '🤝', label: '같이 논의' },
                { mode: 'hierarchical' as RelationMode, icon: '👑→⚔', label: '상하관계' },
              ]).map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setDefaultMode(mode)}
                  className={`flex-1 py-1.5 px-2 rounded text-xs transition-all border ${
                    defaultMode === mode
                      ? 'border-yellow-400 bg-yellow-400/15 text-yellow-400'
                      : 'border-game-border text-gray-500 hover:border-gray-500'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            {memberIds.length >= 2 && (
              <button
                onClick={() => setShowRelationEditor(true)}
                className="mt-2 w-full btn-secondary text-xs py-1.5"
              >
                ⚙ 개별 관계 설정
              </button>
            )}
          </div>

          {/* Output directory */}
          <div className="mb-4">
            <label className="label">📁 결과 저장 폴더</label>
            {outputDir ? (
              <div className="flex items-center gap-2">
                <div
                  className="input-field flex-1 truncate cursor-pointer text-yellow-400/80"
                  title={outputDir}
                  onClick={handlePickOutputDir}
                >
                  {outputDir}
                </div>
                <button
                  onClick={() => setOutputDir(null)}
                  className="text-gray-500 hover:text-red-400 text-sm px-1"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={handlePickOutputDir}
                className="btn-secondary w-full text-xs py-2"
              >
                폴더 선택...
              </button>
            )}
            <p className="text-gray-600 text-xs mt-1">미션 논의 내용이 MD 파일로 저장됩니다</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={resetForm} className="btn-secondary flex-1">초기화</button>
            <button
              onClick={handleSave}
              disabled={!leaderId || !teamName.trim()}
              className="btn-primary flex-1 disabled:opacity-40"
            >
              {editingTeamId ? '수정' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* Relation Editor Modal */}
      {showRelationEditor && (
        <RelationEditor
          agents={agents.filter(a => memberIds.includes(a.id) || a.id === leaderId)}
          relations={relations}
          defaultMode={defaultMode}
          onSave={(newRelations) => { setRelations(newRelations); setShowRelationEditor(false) }}
          onClose={() => setShowRelationEditor(false)}
        />
      )}
    </div>
  )
}

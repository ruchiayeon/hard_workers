import { useState, useEffect, useCallback } from 'react'
import type { Agent, AgentCreate } from '../types/agent'
import { api } from '../api'
import AgentCard from '../components/agent/AgentCard'
import AgentEditor from '../components/agent/AgentEditor'

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  const loadAgents = useCallback(async () => {
    const list = await api.agent.list()
    setAgents(list)
  }, [])

  useEffect(() => { loadAgents() }, [loadAgents])

  const handleCreate = () => {
    setEditingAgent(null)
    setEditorOpen(true)
  }

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setEditorOpen(true)
  }

  const handleDelete = async (agent: Agent) => {
    if (!confirm(`"${agent.name}" 에이전트를 삭제하시겠습니까?`)) return
    await api.agent.delete(agent.id)
    loadAgents()
  }

  const handleSave = async (data: AgentCreate) => {
    if (editingAgent) {
      await api.agent.update(editingAgent.id, data)
    } else {
      await api.agent.create(data)
    }
    setEditorOpen(false)
    setEditingAgent(null)
    loadAgents()
  }

  return (
    <div className="p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-game">에이전트 관리</h1>
          <p className="text-gray-500 text-sm mt-1">팀에 투입할 AI 캐릭터를 만들고 설정합니다</p>
        </div>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
          <span className="text-lg">+</span> 새 에이전트
        </button>
      </div>

      {/* Grid */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60%] text-center">
          <div className="text-6xl mb-4 opacity-40">🤖</div>
          <p className="text-gray-400 text-lg mb-2">아직 에이전트가 없습니다</p>
          <p className="text-gray-600 text-sm mb-6">새 에이전트를 만들어 팀을 구성해보세요</p>
          <button onClick={handleCreate} className="btn-primary">첫 에이전트 만들기</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              size="md"
              showActions
              onEdit={() => handleEdit(agent)}
              onDelete={() => handleDelete(agent)}
            />
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <AgentEditor
          agent={editingAgent}
          onSave={handleSave}
          onClose={() => { setEditorOpen(false); setEditingAgent(null) }}
        />
      )}
    </div>
  )
}

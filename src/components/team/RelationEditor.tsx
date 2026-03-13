import type { Agent } from '../../types/agent'
import type { RelationMode, MemberRelation } from '../../types/team'
import { useState } from 'react'

interface Props {
  agents: Agent[]
  relations: MemberRelation[]
  defaultMode: RelationMode
  onSave: (relations: MemberRelation[]) => void
  onClose: () => void
}

const MODE_LABELS: Record<RelationMode, { icon: string; label: string; color: string }> = {
  solo: { icon: '🗡️', label: '개인', color: 'text-gray-400' },
  collaborate: { icon: '🤝', label: '협업', color: 'text-blue-400' },
  hierarchical: { icon: '👑→⚔', label: '상하', color: 'text-purple-400' },
}

type CellMode = RelationMode | 'hierarchical-reverse' | 'default'

function getCellMode(fromId: string, toId: string, relations: MemberRelation[], defaultMode: RelationMode): CellMode {
  const rel = relations.find(r => r.fromId === fromId && r.toId === toId)
  if (rel) return rel.mode
  // Check reverse hierarchical
  const rev = relations.find(r => r.fromId === toId && r.toId === fromId && r.mode === 'hierarchical')
  if (rev) return 'hierarchical-reverse'
  // Check if there's a collaborate relation in either direction
  const collab = relations.find(r =>
    r.mode === 'collaborate' &&
    ((r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId))
  )
  if (collab) return 'collaborate'
  return 'default'
}

function getCellDisplay(cellMode: CellMode, defaultMode: RelationMode) {
  if (cellMode === 'default') {
    const m = MODE_LABELS[defaultMode]
    return { icon: m.icon, color: 'text-gray-600', bg: '' }
  }
  if (cellMode === 'hierarchical-reverse') {
    return { icon: '⚔←👑', color: 'text-purple-400', bg: 'bg-purple-400/10' }
  }
  const m = MODE_LABELS[cellMode]
  const bgMap: Record<string, string> = { solo: '', collaborate: 'bg-blue-400/10', hierarchical: 'bg-purple-400/10' }
  return { icon: m.icon, color: m.color, bg: bgMap[cellMode] || '' }
}

export default function RelationEditor({ agents, relations: initialRelations, defaultMode, onSave, onClose }: Props) {
  const [relations, setRelations] = useState<MemberRelation[]>([...initialRelations])

  const cycleMode = (fromId: string, toId: string) => {
    const current = getCellMode(fromId, toId, relations, defaultMode)
    // Cycle: default → solo → collaborate → hierarchical(from→to) → hierarchical(to→from) → default
    let next: { mode: RelationMode; fromId: string; toId: string } | null = null

    // Remove existing relations between these two agents
    const filtered = relations.filter(r =>
      !((r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId))
    )

    switch (current) {
      case 'default':
        next = { mode: 'solo', fromId, toId }
        break
      case 'solo':
        next = { mode: 'collaborate', fromId, toId }
        break
      case 'collaborate':
        next = { mode: 'hierarchical', fromId, toId }
        break
      case 'hierarchical':
        next = { mode: 'hierarchical', fromId: toId, toId: fromId }
        break
      case 'hierarchical-reverse':
        // Back to default (remove all)
        next = null
        break
    }

    if (next) {
      setRelations([...filtered, next])
    } else {
      setRelations(filtered)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card-frame p-5 max-w-[600px] w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-pixel text-yellow-400 text-sm">RELATION MATRIX</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        <p className="text-gray-500 text-xs mb-4">셀을 클릭하면 관계 모드가 순환합니다: 기본 → 🗡️개인 → 🤝협업 → 👑→⚔상하 → ⚔←👑역상하 → 기본</p>

        {/* Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-xs text-gray-600"></th>
                {agents.map(a => (
                  <th key={a.id} className="p-2 text-xs text-gray-300 font-normal text-center max-w-[80px] truncate" title={a.name}>
                    {a.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(rowAgent => (
                <tr key={rowAgent.id}>
                  <td className="p-2 text-xs text-gray-300 whitespace-nowrap">{rowAgent.name}</td>
                  {agents.map(colAgent => {
                    if (rowAgent.id === colAgent.id) {
                      return <td key={colAgent.id} className="p-2 text-center text-gray-700 text-xs">---</td>
                    }
                    const cellMode = getCellMode(rowAgent.id, colAgent.id, relations, defaultMode)
                    const display = getCellDisplay(cellMode, defaultMode)
                    return (
                      <td
                        key={colAgent.id}
                        onClick={() => cycleMode(rowAgent.id, colAgent.id)}
                        className={`p-2 text-center cursor-pointer hover:bg-white/5 rounded transition-all border border-transparent hover:border-gray-700 ${display.bg}`}
                      >
                        <span className={`text-sm ${display.color}`}>{display.icon}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="text-gray-600">기본({MODE_LABELS[defaultMode].icon})</span>
          <span className="text-gray-400">🗡️ 개인</span>
          <span className="text-blue-400">🤝 협업</span>
          <span className="text-purple-400">👑→⚔ 상하(감독→부하)</span>
          <span className="text-purple-400">⚔←👑 상하(부하←감독)</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">취소</button>
          <button onClick={() => onSave(relations)} className="btn-primary flex-1">적용</button>
        </div>
      </div>
    </div>
  )
}

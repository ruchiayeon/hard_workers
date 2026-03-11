import type { Agent } from '../../types/agent'
import { PROVIDER_LABELS } from '../../types/agent'

const PROVIDER_BADGE_COLORS: Record<string, string> = {
  openai: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  gemini: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  groq: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ollama: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'claude-cookie': 'bg-red-500/20 text-red-400 border-red-500/30',
}

export type AgentCardStatus = 'idle' | 'thinking' | 'done' | 'error'

interface Props {
  agent: Agent
  selected?: boolean
  isLeader?: boolean
  status?: AgentCardStatus
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
  size?: 'sm' | 'md' | 'lg'
  showActions?: boolean
  streaming?: boolean
}

export default function AgentCard({
  agent,
  selected = false,
  isLeader = false,
  status = 'idle',
  onClick,
  onEdit,
  onDelete,
  size = 'md',
  showActions = false,
  streaming = false,
}: Props) {
  const sizeClasses = {
    sm: 'w-28',
    md: 'w-36',
    lg: 'w-44',
  }

  const portraitSizes = {
    sm: 'h-24',
    md: 'h-32',
    lg: 'h-40',
  }

  const badgeColor = PROVIDER_BADGE_COLORS[agent.llmConfig.provider] ?? PROVIDER_BADGE_COLORS.ollama

  const cardClass = [
    sizeClasses[size],
    'card-frame relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 group',
    selected && isLeader && 'card-glow-gold border-yellow-400/60',
    selected && !isLeader && 'card-glow-blue border-blue-400/60',
    !selected && 'hover:border-gray-500',
    streaming && 'animate-pulse-slow',
    onClick ? 'cursor-pointer' : '',
  ].filter(Boolean).join(' ')

  // Resolve portrait path
  const portraitSrc = agent.portraitFile
    ? agent.portraitFile.startsWith('http') || agent.portraitFile.startsWith('/')
      ? agent.portraitFile
      : `./assets/agents/${agent.portraitFile}`
    : undefined

  return (
    <div className={cardClass} onClick={onClick}>
      {/* Leader crown */}
      {isLeader && (
        <div className="absolute top-1 left-1 z-10 text-yellow-400 text-xs drop-shadow-lg">
          👑
        </div>
      )}

      {/* Status indicator */}
      {status !== 'idle' && (
        <div className="absolute top-1 right-1 z-10">
          {status === 'thinking' && (
            <div className="flex items-center gap-0.5">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
          )}
          {status === 'done' && <span className="text-green-400 text-xs">✓</span>}
          {status === 'error' && <span className="text-red-400 text-xs">✗</span>}
        </div>
      )}

      {/* Portrait */}
      <div className={`${portraitSizes[size]} bg-game-bg flex items-center justify-center relative overflow-hidden`}>
        {portraitSrc ? (
          <img
            src={portraitSrc}
            alt={agent.name}
            className="w-full h-full object-cover"
            style={{ imageRendering: 'auto' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="text-5xl select-none">
            {agent.role.toLowerCase().includes('analyst') ? '🔍' :
             agent.role.toLowerCase().includes('writer') ? '✍️' :
             agent.role.toLowerCase().includes('coder') || agent.role.toLowerCase().includes('developer') ? '💻' :
             agent.role.toLowerCase().includes('research') ? '📚' :
             agent.role.toLowerCase().includes('manager') || agent.role.toLowerCase().includes('leader') ? '👔' :
             agent.role.toLowerCase().includes('design') ? '🎨' :
             '🤖'}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-game-card via-transparent to-transparent" />
      </div>

      {/* Info section */}
      <div className="p-2">
        <div className="text-white font-bold text-sm truncate leading-tight">{agent.name}</div>
        <div className="text-gray-400 text-xs truncate mt-0.5">{agent.role}</div>

        {/* LLM Badge */}
        <div className={`mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${badgeColor}`}>
          {PROVIDER_LABELS[agent.llmConfig.provider]}
        </div>

        {/* Model name */}
        <div className="text-gray-500 text-xs mt-0.5 truncate">{agent.llmConfig.model}</div>
      </div>

      {/* Action buttons (hover reveal) */}
      {showActions && (onEdit || onDelete) && (
        <div className="absolute inset-0 bg-game-bg/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-2 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors"
              title="Edit"
            >
              ✏
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-2 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors"
              title="Delete"
            >
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  )
}

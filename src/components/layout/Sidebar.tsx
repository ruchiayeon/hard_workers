import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/agents', icon: '👤', label: 'Agents', sub: '캐릭터 관리' },
  { path: '/team', icon: '⚔', label: 'Team', sub: '팀 구성' },
  { path: '/run', icon: '▶', label: 'Run', sub: '미션 실행' },
  { path: '/settings', icon: '⚙', label: 'Settings', sub: '설정' },
]

export default function Sidebar() {
  return (
    <nav className="w-20 flex flex-col items-center py-4 border-r border-game-border bg-game-surface gap-2 shrink-0">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `w-16 flex flex-col items-center gap-1 py-3 rounded-lg transition-all duration-200
            ${isActive
              ? 'bg-yellow-400/10 border border-yellow-400/30 text-yellow-400'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`
          }
          title={item.label}
        >
          <span className="text-xl leading-none">{item.icon}</span>
          <span className="text-xs font-pixel leading-none" style={{ fontSize: '7px' }}>
            {item.label.toUpperCase()}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}

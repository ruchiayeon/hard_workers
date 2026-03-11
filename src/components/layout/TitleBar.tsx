import { useLocation } from 'react-router-dom'

const PAGE_TITLES: Record<string, string> = {
  '/agents': 'AGENTS',
  '/team': 'TEAM BUILDER',
  '/run': 'MISSION CONTROL',
  '/settings': 'SETTINGS',
}

export default function TitleBar() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'CREW BUILDER'

  return (
    <div className="flex items-center h-10 px-4 border-b border-game-border select-none">
      <div className="flex items-center gap-3">
        <span className="text-yellow-400 text-lg">⚔</span>
        <span className="font-pixel text-yellow-400 text-xs tracking-widest">CREW BUILDER</span>
        <span className="text-game-border mx-2">|</span>
        <span className="text-gray-400 text-sm tracking-widest font-semibold">{title}</span>
      </div>
    </div>
  )
}

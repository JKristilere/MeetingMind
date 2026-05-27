import { Bell } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/meetings':  'Meetings',
  '/upload':    'Upload Meeting',
  '/settings':  'Settings',
}

export default function TopBar() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  const title =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.startsWith('/meetings/') ? 'Meeting Detail' : 'MeetingMind')

  return (
    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-8 flex-shrink-0">
      <h1 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h1>

      <div className="flex items-center gap-1">
        <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full ring-2 ring-white" />
        </button>
        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-[11px] cursor-pointer ml-1">
          {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  )
}

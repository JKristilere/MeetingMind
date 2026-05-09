import { Bell } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

export default function TopBar() {
  const user = useAuthStore((s) => s.user)

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium text-sm">
          {user?.full_name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}

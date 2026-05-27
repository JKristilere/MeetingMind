import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Mic, Upload, Settings, LogOut, Brain } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/meetings',  icon: Mic,             label: 'Meetings'  },
  { to: '/upload',    icon: Upload,           label: 'Upload'    },
  { to: '/settings',  icon: Settings,         label: 'Settings'  },
]

export default function Sidebar() {
  const { logout, user } = useAuthStore()

  return (
    <aside
      className="w-60 flex flex-col flex-shrink-0 select-none"
      style={{ background: '#0d0d11' }}
    >
      {/* ── Logo ───────────────────────────────────────────────────── */}
      <div className="px-5 h-14 flex items-center border-b border-white/[0.05] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white text-[15px] tracking-tight">
            MeetingMind
          </span>
        </div>
      </div>

      {/* ── Label ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
          Navigation
        </p>
      </div>

      {/* ── Nav ────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 py-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 py-2 pr-4 text-sm border-l-2 transition-all duration-100 ${
                isActive
                  ? 'border-indigo-400 pl-[18px] text-white font-medium bg-white/[0.05]'
                  : 'border-transparent pl-[20px] text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] font-normal'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-400' : ''}`}
                />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── User footer ────────────────────────────────────────────── */}
      <div className="border-t border-white/[0.05] flex-shrink-0 p-3">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/[0.04] transition-colors mb-0.5">
          <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
            {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-300 truncate leading-tight">
              {user?.full_name}
            </p>
            <p className="text-[10px] text-slate-600 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}

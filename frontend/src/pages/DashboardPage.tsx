import { useQuery } from '@tanstack/react-query'
import { Mic, CheckSquare, Clock, TrendingUp, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/meetings/StatusBadge'
import type { Meeting } from '../types'

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId)

  const { data } = useQuery({
    queryKey: ['meetings', currentOrgId, 'recent'],
    queryFn: () => meetingApi.list(currentOrgId!, { page_size: 5 }),
    enabled: !!currentOrgId,
  })

  const meetings = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const completed = meetings.filter((m: Meeting) => m.status === 'completed').length
  const processing = meetings.filter((m: Meeting) =>
    ['processing', 'transcribing', 'analysing'].includes(m.status)
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Your meeting intelligence overview</p>
      </div>

      {!currentOrgId && (
        <div className="card p-6 border-dashed border-2 border-primary-200 bg-primary-50 text-center">
          <Mic className="w-10 h-10 text-primary-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 mb-1">Set up your workspace</h3>
          <p className="text-sm text-gray-600 mb-4">Create an organisation to start recording meetings</p>
          <Link to="/settings" className="btn-primary inline-flex items-center gap-2">
            Get started <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Mic} label="Total Meetings" value={total} color="bg-blue-100 text-blue-600" />
        <StatCard icon={CheckSquare} label="Completed" value={completed} color="bg-green-100 text-green-600" />
        <StatCard icon={Clock} label="Processing" value={processing} color="bg-yellow-100 text-yellow-600" />
        <StatCard icon={TrendingUp} label="This Month" value={total} color="bg-purple-100 text-purple-600" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Meetings</h2>
          <Link to="/meetings" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {meetings.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Mic className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No meetings yet. Upload your first recording!</p>
            <Link to="/upload" className="btn-primary inline-flex mt-4 text-sm">Upload meeting</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {meetings.map((meeting: Meeting) => (
              <Link
                key={meeting.id}
                to={`/meetings/${meeting.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-4.5 h-4.5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{meeting.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {format(new Date(meeting.created_at), 'MMM d, yyyy')}
                    {meeting.audio_duration_seconds && ` · ${Math.round(meeting.audio_duration_seconds / 60)} min`}
                  </p>
                </div>
                <StatusBadge status={meeting.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

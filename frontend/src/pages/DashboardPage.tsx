import { useQuery } from '@tanstack/react-query'
import {
  Mic, CheckCircle2, Clock, TrendingUp, ArrowRight, Upload,
  Sparkles, BarChart2, Target, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/meetings/StatusBadge'
import type { Meeting } from '../types'

/* ── Stat card ─────────────────────────────────────────────────────── */
function StatCard({
  icon: Icon, label, value, sub, iconBg,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  iconBg: string
}) {
  return (
    <div className="card-hover p-6 flex flex-col gap-3">
      <p className="label-caps">{label}</p>
      <p className="text-4xl font-bold font-mono tracking-tight text-slate-900 leading-none">
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
      <div className={`w-8 h-8 rounded-md ${iconBg} flex items-center justify-center mt-auto`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  )
}

/* ── Custom tooltip ────────────────────────────────────────────────── */
function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl font-mono">
      <p className="font-medium">{label}</p>
      <p className="text-slate-400 mt-0.5">{payload[0].value} meetings</p>
    </div>
  )
}

const BAR_COLORS = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff']

export default function DashboardPage() {
  const { currentOrgId, user } = useAuthStore()

  const { data } = useQuery({
    queryKey: ['meetings', currentOrgId, 'recent'],
    queryFn: () => meetingApi.list(currentOrgId!, { page_size: 20 }),
    enabled: !!currentOrgId,
  })

  const meetings: Meeting[] = data?.data?.items ?? []
  const total      = data?.data?.total ?? 0
  const completed  = meetings.filter((m) => m.status === 'completed').length
  const processing = meetings.filter((m) =>
    ['processing', 'transcribing', 'analysing', 'uploading'].includes(m.status)
  ).length
  const avgScore = meetings
    .filter((m) => m.meeting_effectiveness_score != null)
    .reduce((sum, m, _, arr) => sum + (m.meeting_effectiveness_score ?? 0) / arr.length, 0)
  const recentFive = meetings.slice(0, 5)

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const label  = format(d, 'EEE')
    const dateStr = format(d, 'yyyy-MM-dd')
    const count  = meetings.filter((m) => m.created_at.startsWith(dateStr)).length
    return { label, count }
  })

  const sentimentCounts = {
    positive: meetings.filter((m) => m.sentiment === 'positive').length,
    neutral:  meetings.filter((m) => m.sentiment === 'neutral').length,
    mixed:    meetings.filter((m) => m.sentiment === 'mixed').length,
    negative: meetings.filter((m) => m.sentiment === 'negative').length,
  }

  const greetingHour = new Date().getHours()
  const greeting =
    greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-8 max-w-7xl">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-caps mb-1">{greeting}</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {user?.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
        </div>
        <Link to="/upload" className="btn-primary gap-2">
          <Upload className="w-4 h-4" />
          New Meeting
        </Link>
      </div>

      {/* ── No org callout ──────────────────────────────────────── */}
      {!currentOrgId && (
        <div className="card p-8 border-2 border-dashed border-indigo-200 bg-indigo-50/40 text-center">
          <div className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1.5">Set up your workspace</h3>
          <p className="text-sm text-slate-500 mb-5">
            Create an organisation to start transcribing meetings
          </p>
          <Link to="/settings" className="btn-primary">
            Get started <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Mic}
          label="Total Meetings"
          value={total}
          sub="All time"
          iconBg="bg-indigo-100 text-indigo-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={completed}
          sub={total ? `${Math.round((completed / total) * 100)}% success rate` : undefined}
          iconBg="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          icon={Clock}
          label="Processing"
          value={processing}
          sub={processing > 0 ? 'In progress now' : 'Queue empty'}
          iconBg="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={Target}
          label="Avg. Score"
          value={avgScore ? `${avgScore.toFixed(1)}/10` : '—'}
          sub="AI effectiveness rating"
          iconBg="bg-violet-100 text-violet-600"
        />
      </div>

      {/* ── Charts row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity bar chart */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="label-caps mb-1">Meeting Activity</p>
              <p className="font-semibold text-slate-900 text-sm">Last 7 days</p>
            </div>
            <div className="w-8 h-8 rounded-md bg-indigo-100 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={chartData} barSize={24}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}
              />
              <YAxis hide allowDecimals={false} />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(79,70,229,0.04)', radius: 4 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment breakdown */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="label-caps mb-1">Sentiment</p>
              <p className="font-semibold text-slate-900 text-sm">Completed meetings</p>
            </div>
            <div className="w-8 h-8 rounded-md bg-violet-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          {completed === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No completed meetings yet</p>
          ) : (
            <div className="space-y-4">
              {[
                { label: 'Positive', key: 'positive', color: 'bg-emerald-500', text: 'text-emerald-700' },
                { label: 'Neutral',  key: 'neutral',  color: 'bg-sky-500',     text: 'text-sky-700'     },
                { label: 'Mixed',    key: 'mixed',     color: 'bg-amber-500',   text: 'text-amber-700'   },
                { label: 'Negative', key: 'negative',  color: 'bg-red-500',     text: 'text-red-700'     },
              ].map(({ label, key, color, text }) => {
                const count = sentimentCounts[key as keyof typeof sentimentCounts]
                const pct = Math.round((count / completed) * 100)
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-medium ${text}`}>{label}</span>
                      <span className="font-mono text-xs text-slate-400">{count}</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent meetings ──────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <div>
              <p className="label-caps leading-none mb-0.5">Recent</p>
              <p className="font-semibold text-slate-900 text-sm leading-none">Meetings</p>
            </div>
          </div>
          <Link
            to="/meetings"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentFive.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-6 h-6 text-indigo-300" />
            </div>
            <p className="font-semibold text-slate-700 mb-1.5">No meetings yet</p>
            <p className="text-sm text-slate-400 mb-5">Upload your first recording to get started</p>
            <Link to="/upload" className="btn-primary">
              <Upload className="w-4 h-4" /> Upload meeting
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentFive.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meetings/${meeting.id}`}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/60 transition-colors group"
              >
                <div className="w-8 h-8 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
                    {meeting.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {format(new Date(meeting.created_at), 'MMM d, yyyy')}
                    {meeting.audio_duration_seconds &&
                      ` · ${Math.round(meeting.audio_duration_seconds / 60)} min`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {meeting.meeting_effectiveness_score && (
                    <span className="text-xs font-mono font-semibold text-slate-500">
                      {meeting.meeting_effectiveness_score}
                      <span className="text-slate-300">/10</span>
                    </span>
                  )}
                  <StatusBadge status={meeting.status} />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-indigo-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

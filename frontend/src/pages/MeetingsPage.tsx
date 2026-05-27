import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mic, Search, Upload, ArrowRight, Clock, Filter, Video } from 'lucide-react'
import { format } from 'date-fns'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/meetings/StatusBadge'
import type { Meeting, MeetingSource, MeetingStatus } from '../types'

const SOURCE_BADGE: Partial<Record<MeetingSource, { label: string; classes: string; icon?: React.ElementType }>> = {
  zoom:        { label: 'Zoom',        classes: 'bg-sky-100 text-sky-700',        icon: Video },
  google_meet: { label: 'Google Meet', classes: 'bg-emerald-100 text-emerald-700'             },
  teams:       { label: 'Teams',       classes: 'bg-indigo-100 text-indigo-700'               },
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All',          value: ''             },
  { label: 'Completed',    value: 'completed'    },
  { label: 'Processing',   value: 'processing'   },
  { label: 'Transcribing', value: 'transcribing' },
  { label: 'Analysing',    value: 'analysing'    },
  { label: 'Failed',       value: 'failed'       },
]

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-700 bg-emerald-50',
  negative: 'text-red-700 bg-red-50',
  neutral:  'text-sky-700 bg-sky-50',
  mixed:    'text-amber-700 bg-amber-50',
}

export default function MeetingsPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page,         setPage]         = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['meetings', currentOrgId, page, search, statusFilter],
    queryFn: () =>
      meetingApi.list(currentOrgId!, {
        page,
        page_size: 15,
        search:    search       || undefined,
        status:    statusFilter || undefined,
      }),
    enabled: !!currentOrgId,
  })

  const meetings: Meeting[] = data?.data?.items ?? []
  const totalPages = data?.data?.total_pages ?? 1
  const total      = data?.data?.total ?? 0

  return (
    <div className="space-y-6 max-w-7xl">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="label-caps mb-1">Library</p>
          <h1 className="page-title">Meetings</h1>
          <p className="text-slate-400 text-sm mt-1 font-mono">
            {total} recording{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link to="/upload" className="btn-primary self-start sm:self-auto">
          <Upload className="w-4 h-4" /> Upload meeting
        </Link>
      </div>

      {/* ── Search + filter bar ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-10"
            placeholder="Search meetings…"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-md border border-slate-200 p-1 self-start sm:self-auto shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 ml-1.5 flex-shrink-0" />
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setStatusFilter(value); setPage(1) }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                statusFilter === value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="card p-12 text-center">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading meetings…</p>
        </div>
      ) : meetings.length === 0 ? (
        <div className="card py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Mic className="w-6 h-6 text-indigo-300" />
          </div>
          <p className="font-semibold text-slate-700 mb-1.5">
            {search || statusFilter ? 'No matches found' : 'No meetings yet'}
          </p>
          <p className="text-sm text-slate-400 mb-6">
            {search || statusFilter
              ? 'Try adjusting your search or filter'
              : 'Upload your first recording to get AI-powered insights'}
          </p>
          {!search && !statusFilter && (
            <Link to="/upload" className="btn-primary">
              <Upload className="w-4 h-4" /> Upload first meeting
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#fafafa' }}>
                <th className="px-6 py-3 text-left">
                  <span className="label-caps">Meeting</span>
                </th>
                <th className="px-6 py-3 text-left">
                  <span className="label-caps">Status</span>
                </th>
                <th className="px-6 py-3 text-left hidden md:table-cell">
                  <span className="label-caps">Duration</span>
                </th>
                <th className="px-6 py-3 text-left hidden sm:table-cell">
                  <span className="label-caps">Sentiment</span>
                </th>
                <th className="px-6 py-3 text-left hidden lg:table-cell">
                  <span className="label-caps">Score</span>
                </th>
                <th className="px-6 py-3 text-left">
                  <span className="label-caps">Date</span>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {meetings.map((m: Meeting) => (
                <tr key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <Mic className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/meetings/${m.id}`}
                            className="font-medium text-slate-900 hover:text-indigo-700 transition-colors truncate max-w-xs"
                          >
                            {m.title}
                          </Link>
                          {SOURCE_BADGE[m.source] && (() => {
                            const cfg = SOURCE_BADGE[m.source]!
                            const Icon = cfg.icon
                            return (
                              <span className={`badge gap-1 flex-shrink-0 ${cfg.classes}`}>
                                {Icon && <Icon className="w-2.5 h-2.5" />}
                                {cfg.label}
                              </span>
                            )
                          })()}
                        </div>
                        {m.original_filename && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs font-mono">
                            {m.original_filename}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={m.status as MeetingStatus} />
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      <span className="text-xs font-mono">
                        {m.audio_duration_seconds
                          ? `${Math.round(m.audio_duration_seconds / 60)} min`
                          : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    {m.sentiment ? (
                      <span className={`badge ${SENTIMENT_COLORS[m.sentiment] ?? 'bg-slate-100 text-slate-600'}`}>
                        {m.sentiment}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs font-mono">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    {m.meeting_effectiveness_score ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${(m.meeting_effectiveness_score / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-semibold text-slate-700">
                          {m.meeting_effectiveness_score}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs font-mono">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-slate-400">
                      {format(new Date(m.created_at), 'MMM d')}
                    </span>
                  </td>
                  <td className="pr-4">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-indigo-400 transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100" style={{ background: '#fafafa' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary text-xs py-1.5 disabled:opacity-40"
              >
                ← Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = i + 1
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded text-xs font-mono font-medium transition-all ${
                        page === p
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
                {totalPages > 5 && (
                  <span className="text-slate-400 text-xs font-mono px-1">…{totalPages}</span>
                )}
              </div>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary text-xs py-1.5 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

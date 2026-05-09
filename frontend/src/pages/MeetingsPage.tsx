import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mic, Search, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/meetings/StatusBadge'
import type { Meeting } from '../types'

export default function MeetingsPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['meetings', currentOrgId, page, search],
    queryFn: () => meetingApi.list(currentOrgId!, { page, page_size: 20, search: search || undefined }),
    enabled: !!currentOrgId,
  })

  const meetings = data?.data?.items ?? []
  const totalPages = data?.data?.total_pages ?? 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.data?.total ?? 0} total recordings</p>
        </div>
        <Link to="/upload" className="btn-primary flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload meeting
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="input pl-9"
          placeholder="Search meetings…"
        />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : meetings.length === 0 ? (
          <div className="p-10 text-center">
            <Mic className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No meetings found</p>
            <Link to="/upload" className="btn-primary inline-flex mt-4 text-sm gap-2">
              <Upload className="w-4 h-4" /> Upload first meeting
            </Link>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Meeting</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {meetings.map((m: Meeting) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <Link to={`/meetings/${m.id}`} className="font-medium text-gray-900 hover:text-primary-600">
                        {m.title}
                      </Link>
                      {m.original_filename && (
                        <p className="text-xs text-gray-400 mt-0.5">{m.original_filename}</p>
                      )}
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={m.status} /></td>
                    <td className="px-5 py-4 text-gray-500">
                      {m.audio_duration_seconds ? `${Math.round(m.audio_duration_seconds / 60)} min` : '—'}
                    </td>
                    <td className="px-5 py-4 text-gray-500">
                      {format(new Date(m.created_at), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

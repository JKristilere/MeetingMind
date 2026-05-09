import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Clock, Users, FileText, Lightbulb, Target } from 'lucide-react'
import { format } from 'date-fns'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/meetings/StatusBadge'
import type { ActionItem, Meeting } from '../types'
import toast from 'react-hot-toast'

const PRIORITY_CLASSES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

const SENTIMENT_CLASSES: Record<string, string> = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral: 'text-gray-600',
  mixed: 'text-yellow-600',
}

export default function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const currentOrgId = useAuthStore((s) => s.currentOrgId)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => meetingApi.get(currentOrgId!, meetingId!),
    enabled: !!currentOrgId && !!meetingId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status
      return ['processing', 'transcribing', 'analysing'].includes(status ?? '') ? 4000 : false
    },
  })

  const meeting: Meeting | undefined = data?.data

  const completeItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      meetingApi.updateActionItem(currentOrgId!, meetingId!, itemId, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      toast.success('Action item marked complete')
    },
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading meeting…</div>
  if (!meeting) return <div className="p-8 text-center text-gray-400">Meeting not found</div>

  const openItems = meeting.action_items?.filter((i) => i.status === 'open') ?? []
  const completedItems = meeting.action_items?.filter((i) => i.status === 'completed') ?? []

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/meetings" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{meeting.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={meeting.status} />
            <span className="text-gray-400 text-xs">·</span>
            <span className="text-xs text-gray-500">{format(new Date(meeting.created_at), 'MMM d, yyyy')}</span>
            {meeting.audio_duration_seconds && (
              <>
                <span className="text-gray-400 text-xs">·</span>
                <span className="text-xs text-gray-500">{Math.round(meeting.audio_duration_seconds / 60)} min</span>
              </>
            )}
          </div>
        </div>
      </div>

      {['processing', 'transcribing', 'analysing'].includes(meeting.status) && (
        <div className="card p-5 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center animate-spin">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-900">
                {meeting.status === 'transcribing' ? 'Transcribing audio…' :
                 meeting.status === 'analysing' ? 'Analysing with AI…' : 'Processing…'}
              </p>
              <p className="text-sm text-blue-600">This usually takes 1–5 minutes. You can leave this page.</p>
            </div>
          </div>
        </div>
      )}

      {meeting.status === 'completed' && (
        <>
          {/* Summary */}
          {meeting.summary && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4.5 h-4.5 text-yellow-500" />
                <h2 className="font-semibold text-gray-900">Summary</h2>
                {meeting.sentiment && (
                  <span className={`ml-auto text-xs font-medium ${SENTIMENT_CLASSES[meeting.sentiment] ?? 'text-gray-600'}`}>
                    {meeting.sentiment} sentiment
                  </span>
                )}
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{meeting.summary}</p>

              {meeting.meeting_effectiveness_score && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Meeting effectiveness:</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-32">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${(meeting.meeting_effectiveness_score / 10) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700">
                    {meeting.meeting_effectiveness_score}/10
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Key Decisions */}
          {meeting.key_decisions && meeting.key_decisions.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4.5 h-4.5 text-primary-600" />
                <h2 className="font-semibold text-gray-900">Key Decisions</h2>
              </div>
              <ul className="space-y-3">
                {meeting.key_decisions.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.decision}</p>
                      {d.context && <p className="text-xs text-gray-500 mt-0.5">{d.context}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Items */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-4.5 h-4.5 text-green-500" />
              <h2 className="font-semibold text-gray-900">Action Items</h2>
              <span className="ml-auto text-xs text-gray-500">
                {completedItems.length}/{(meeting.action_items?.length ?? 0)} done
              </span>
            </div>

            {openItems.length === 0 && completedItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No action items extracted</p>
            ) : (
              <div className="space-y-2">
                {[...openItems, ...completedItems].map((item: ActionItem) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      item.status === 'completed' ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'
                    }`}
                  >
                    <button
                      onClick={() => item.status === 'open' && completeItemMutation.mutate(item.id)}
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        item.status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : 'border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {item.status === 'completed' && <CheckCircle className="w-3 h-3 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {item.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {item.assignee_name_raw && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {item.assignee_name_raw}
                          </span>
                        )}
                        {item.due_date && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {format(new Date(item.due_date), 'MMM d')}
                          </span>
                        )}
                        <span className={`status-badge ${PRIORITY_CLASSES[item.priority]}`}>
                          {item.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transcript */}
          {meeting.transcript && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4.5 h-4.5 text-gray-400" />
                <h2 className="font-semibold text-gray-900">Transcript</h2>
                {meeting.transcript.detected_language && (
                  <span className="ml-auto text-xs text-gray-400">
                    Detected: {meeting.transcript.detected_language}
                    {meeting.transcript.word_count && ` · ${meeting.transcript.word_count.toLocaleString()} words`}
                  </span>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                  {meeting.transcript.raw_text}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {meeting.status === 'failed' && (
        <div className="card p-5 border-red-200 bg-red-50">
          <p className="text-red-700 font-medium">Processing failed</p>
          {meeting.error_message && (
            <p className="text-red-600 text-sm mt-1">{meeting.error_message}</p>
          )}
        </div>
      )}
    </div>
  )
}

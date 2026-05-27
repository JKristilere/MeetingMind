import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, Clock, Users, FileText, Lightbulb,
  Target, Sparkles, TrendingUp, Tag, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Hash,
} from 'lucide-react'
import { format } from 'date-fns'
import { useState } from 'react'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/meetings/StatusBadge'
import type { ActionItem, Meeting } from '../types'
import toast from 'react-hot-toast'

/* ── Priority chip ─────────────────────────────────────────────────── */
const PRIORITY_CONFIG = {
  high:   { classes: 'bg-red-100 text-red-700',    dot: 'bg-red-500'   },
  medium: { classes: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  low:    { classes: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
}

/* ── Sentiment config ──────────────────────────────────────────────── */
const SENTIMENT_CONFIG: Record<string, { label: string; classes: string; bar: string }> = {
  positive: { label: 'Positive', classes: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  negative: { label: 'Negative', classes: 'bg-red-100 text-red-700',         bar: 'bg-red-500'     },
  neutral:  { label: 'Neutral',  classes: 'bg-sky-100 text-sky-700',         bar: 'bg-sky-500'     },
  mixed:    { label: 'Mixed',    classes: 'bg-amber-100 text-amber-700',     bar: 'bg-amber-500'   },
}

const PROCESSING_LABELS: Record<string, { title: string; sub: string }> = {
  uploading:    { title: 'Uploading audio…',    sub: 'Transferring your file to the server.'                         },
  processing:   { title: 'Processing audio…',   sub: 'Preparing the file for transcription.'                         },
  transcribing: { title: 'Transcribing audio…', sub: 'Converting speech to text. This may take a few minutes.'       },
  analysing:    { title: 'Analysing with AI…',  sub: 'Extracting insights, decisions, and action items.'             },
}

export default function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const currentOrgId = useAuthStore((s) => s.currentOrgId)
  const queryClient = useQueryClient()
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => meetingApi.get(currentOrgId!, meetingId!),
    enabled: !!currentOrgId && !!meetingId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status
      return ['uploading', 'processing', 'transcribing', 'analysing'].includes(status ?? '')
        ? 4000
        : false
    },
  })

  const meeting: Meeting | undefined = data?.data

  const completeItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      meetingApi.updateActionItem(currentOrgId!, meetingId!, itemId, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      toast.success('Action item marked complete!')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading meeting…</p>
        </div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="card p-12 text-center max-w-md mx-auto">
        <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-700 mb-1">Meeting not found</p>
        <Link to="/meetings" className="btn-secondary mt-4">Back to meetings</Link>
      </div>
    )
  }

  const openItems       = meeting.action_items?.filter((i) => i.status === 'open')        ?? []
  const inProgressItems = meeting.action_items?.filter((i) => i.status === 'in_progress') ?? []
  const completedItems  = meeting.action_items?.filter((i) => i.status === 'completed')   ?? []
  const totalItems      = meeting.action_items?.length ?? 0
  const doneCount       = completedItems.length
  const completionPct   = totalItems ? Math.round((doneCount / totalItems) * 100) : 0

  const isProcessing   = ['uploading', 'processing', 'transcribing', 'analysing'].includes(meeting.status)
  const processingInfo = PROCESSING_LABELS[meeting.status] ?? { title: 'Processing…', sub: '' }
  const sentiment      = meeting.sentiment ? SENTIMENT_CONFIG[meeting.sentiment] : null
  const scoreWidth     = meeting.meeting_effectiveness_score
    ? `${(meeting.meeting_effectiveness_score / 10) * 100}%`
    : '0%'

  return (
    <div className="space-y-5 max-w-4xl">
      {/* ── Back + header ───────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link
          to="/meetings"
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors mt-0.5 flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 leading-tight">{meeting.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={meeting.status} />
            <span className="text-slate-200">·</span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(meeting.created_at), 'MMM d, yyyy · h:mm a')}
            </span>
            {meeting.audio_duration_seconds && (
              <>
                <span className="text-slate-200">·</span>
                <span className="text-xs text-slate-400">
                  {Math.round(meeting.audio_duration_seconds / 60)} min
                </span>
              </>
            )}
            {meeting.language && meeting.language !== 'auto' && (
              <span className="badge bg-indigo-50 text-indigo-600">
                {meeting.language.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Processing banner ───────────────────────────────────── */}
      {isProcessing && (
        <div className="card p-5 border-indigo-200 bg-indigo-50/60">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{processingInfo.title}</p>
              <p className="text-sm text-slate-500 mt-0.5">{processingInfo.sub}</p>
              <p className="text-xs text-indigo-600 mt-1 font-medium">
                Auto-refreshing every 4 seconds. You can safely leave this page.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Completed content ───────────────────────────────────── */}
      {meeting.status === 'completed' && (
        <>
          {/* Summary + meta row */}
          {meeting.summary && (
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-indigo-600" />
                </div>
                <h2 className="section-title">Summary</h2>
                {sentiment && (
                  <span className={`status-badge ml-auto ${sentiment.classes}`}>
                    {sentiment.label} sentiment
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">{meeting.summary}</p>

              {/* Effectiveness score */}
              {meeting.meeting_effectiveness_score && (
                <div className="mt-5 flex items-center gap-3 pt-4 border-t border-slate-100">
                  <TrendingUp className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-500 font-medium">Meeting Effectiveness</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {meeting.meeting_effectiveness_score}/10
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                        style={{ width: scoreWidth }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Topics discussed */}
          {meeting.topics_discussed && meeting.topics_discussed.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Hash className="w-4 h-4 text-violet-600" />
                </div>
                <h2 className="section-title">Topics Discussed</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {meeting.topics_discussed.map((topic, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60"
                  >
                    <Tag className="w-3 h-3 text-slate-400" />
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key decisions */}
          {meeting.key_decisions && meeting.key_decisions.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-100 flex items-center justify-center">
                  <Target className="w-4 h-4 text-fuchsia-600" />
                </div>
                <h2 className="section-title">Key Decisions</h2>
                <span className="ml-auto badge bg-fuchsia-50 text-fuchsia-700">
                  {meeting.key_decisions.length}
                </span>
              </div>
              <div className="space-y-3">
                {meeting.key_decisions.map((d, i) => (
                  <div key={i} className="flex gap-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="w-6 h-6 rounded-md bg-indigo-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{d.decision}</p>
                      {d.context && (
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{d.context}</p>
                      )}
                      {d.decided_by && (
                        <p className="text-xs text-indigo-600 mt-1.5 font-medium flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {d.decided_by}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action items */}
          <div className="card p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <h2 className="section-title">Action Items</h2>
              {totalItems > 0 && (
                <div className="ml-auto flex items-center gap-2.5">
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 tabular-nums">
                    {doneCount}/{totalItems}
                  </span>
                </div>
              )}
            </div>

            {totalItems === 0 ? (
              <div className="py-8 text-center">
                <Sparkles className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No action items extracted</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...openItems, ...inProgressItems, ...completedItems].map((item: ActionItem) => {
                  const priorityCfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.low
                  const isDone = item.status === 'completed'
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all duration-200 ${
                        isDone
                          ? 'bg-slate-50/60 border-slate-100 opacity-60'
                          : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-sm'
                      }`}
                    >
                      <button
                        onClick={() => !isDone && completeItemMutation.mutate(item.id)}
                        disabled={isDone}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150 ${
                          isDone
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300 hover:border-indigo-500 hover:bg-indigo-50'
                        }`}
                      >
                        {isDone && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          isDone ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}>
                          {item.title}
                        </p>
                        {item.description && !isDone && (
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {item.assignee_name_raw && (
                            <span className="badge bg-indigo-50 text-indigo-700 gap-1">
                              <Users className="w-3 h-3" />
                              {item.assignee_name_raw}
                            </span>
                          )}
                          {item.due_date && (
                            <span className="badge bg-slate-100 text-slate-600 gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(item.due_date), 'MMM d')}
                            </span>
                          )}
                          <span className={`badge gap-1 ${priorityCfg.classes}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                            {item.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Participants */}
          {meeting.participants && meeting.participants.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                  <Users className="w-4 h-4 text-sky-600" />
                </div>
                <h2 className="section-title">Participants</h2>
                <span className="ml-auto badge bg-sky-50 text-sky-700">
                  {meeting.participants.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {meeting.participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {p.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.name}</p>
                      {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          {meeting.transcript && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setTranscriptExpanded((v) => !v)}
                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50/60 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-slate-900 text-sm">Transcript</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {meeting.transcript.detected_language
                      ? `Detected: ${meeting.transcript.detected_language}`
                      : 'Full transcript'}
                    {meeting.transcript.word_count
                      ? ` · ${meeting.transcript.word_count.toLocaleString()} words`
                      : ''}
                    {meeting.transcript.confidence_score
                      ? ` · ${Math.round(meeting.transcript.confidence_score * 100)}% confidence`
                      : ''}
                  </p>
                </div>
                {transcriptExpanded
                  ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              </button>

              {transcriptExpanded && (
                <div className="border-t border-slate-100 px-6 pb-6">
                  {meeting.transcript.segments && meeting.transcript.segments.length > 0 ? (
                    <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
                      {meeting.transcript.segments.map((seg, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex-shrink-0 text-right w-10">
                            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                              {Math.floor(seg.start / 60)}:{String(Math.floor(seg.start % 60)).padStart(2, '0')}
                            </span>
                          </div>
                          <div>
                            {seg.speaker && (
                              <span className="text-xs font-semibold text-indigo-600 mr-1.5">
                                {seg.speaker}
                              </span>
                            )}
                            <span className="text-sm text-slate-700 leading-relaxed">{seg.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto border border-slate-100">
                      <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                        {meeting.transcript.raw_text}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Failed state ─────────────────────────────────────────── */}
      {meeting.status === 'failed' && (
        <div className="card p-5 border border-red-200 bg-red-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-red-800">Processing failed</p>
              {meeting.error_message && (
                <p className="text-red-600 text-sm mt-0.5">{meeting.error_message}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

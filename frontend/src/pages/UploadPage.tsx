import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Upload, FileAudio, X, Loader2, Brain, Mic, FileText,
  CheckCircle2, Sparkles, Settings2, Video, ChevronRight,
  ArrowRight, Zap, Users, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { meetingApi, orgApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import type { OrgMember } from '../types'

type UploadMode = 'file' | 'zoom'

const SUPPORTED = [
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
  'audio/ogg', 'audio/flac', 'audio/webm', 'video/mp4', 'video/webm',
]

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect'         },
  { value: 'en',   label: 'English (Nigerian)'  },
  { value: 'pcm',  label: 'Nigerian Pidgin'     },
  { value: 'yo',   label: 'Yoruba'              },
  { value: 'ig',   label: 'Igbo'                },
  { value: 'ha',   label: 'Hausa'               },
  { value: 'fr',   label: 'French'              },
  { value: 'sw',   label: 'Swahili'             },
]

const STEPS = [
  { icon: Upload,   label: 'Upload',    sub: 'File sent to server'        },
  { icon: Mic,      label: 'Transcribe', sub: 'Speech-to-text by Whisper' },
  { icon: Brain,    label: 'Analyse',   sub: 'AI extracts insights'        },
  { icon: FileText, label: 'Deliver',   sub: 'Summary to email & WhatsApp' },
]

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadPage() {
  const navigate = useNavigate()
  const currentOrgId = useAuthStore((s) => s.currentOrgId)
  const [mode,              setMode]              = useState<UploadMode>('file')
  const [file,              setFile]              = useState<File | null>(null)
  const [title,             setTitle]             = useState('')
  const [language,          setLanguage]          = useState('auto')
  const [progress,          setProgress]          = useState(0)
  const [participantIds,    setParticipantIds]    = useState<string[]>([])
  const [participantSearch, setParticipantSearch] = useState('')

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ['org-members', currentOrgId],
    queryFn: () => orgApi.members(currentOrgId!).then((r) => r.data),
    enabled: !!currentOrgId,
  })

  function toggleParticipant(userId: string) {
    setParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const filteredMembers = members.filter(
    (m) =>
      m.full_name.toLowerCase().includes(participantSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(participantSearch.toLowerCase()),
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0]
      if (f) {
        setFile(f)
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
      }
    },
    [title],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(SUPPORTED.map((t) => [t, []])),
    maxSize: 500 * 1024 * 1024,
    multiple: false,
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!currentOrgId || !file) throw new Error('Missing org or file')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', title || file.name)
      fd.append('language', language)
      if (participantIds.length) fd.append('participant_ids', participantIds.join(','))
      return meetingApi.upload(currentOrgId, fd, setProgress)
    },
    onSuccess: ({ data }) => {
      toast.success('Upload complete! Processing your meeting…')
      navigate(`/meetings/${data.id}`)
    },
    onError: () => toast.error('Upload failed. Please try again.'),
  })

  if (!currentOrgId) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="w-14 h-14 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <Settings2 className="w-7 h-7 text-indigo-400" />
        </div>
        <h2 className="font-semibold text-slate-900 text-lg mb-2">No workspace yet</h2>
        <p className="text-slate-500 text-sm mb-6">Create an organisation in Settings before uploading.</p>
        <Link to="/settings" className="btn-primary">Go to Settings</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="page-title">Add Meeting</h1>
        <p className="text-slate-400 text-sm mt-1">
          Upload a recording or connect Zoom to import automatically
        </p>
      </div>

      {/* ── Mode switcher ────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100/60 rounded-lg p-1 w-fit border border-slate-200/60">
        <button
          onClick={() => setMode('file')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
            mode === 'file'
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload File
        </button>
        <button
          onClick={() => setMode('zoom')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
            mode === 'zoom'
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Video className="w-4 h-4" />
          Import from Zoom
        </button>
      </div>

      {/* ══ FILE UPLOAD MODE ════════════════════════════════════════ */}
      {mode === 'file' && (
        <>
          {/* ── Processing pipeline ─────────────────────────────────── */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              {STEPS.map(({ icon: Icon, label, sub }, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center mb-1.5">
                      <Icon className="w-4 h-4 text-indigo-500" />
                    </div>
                    <p className="text-xs font-medium text-slate-700">{label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block max-w-[80px]">{sub}</p>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-8 sm:w-12 h-px bg-slate-200 mx-1 sm:mx-2 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Drop zone ───────────────────────────────────────────── */}
          <div
            {...getRootProps()}
            className={`card border-2 border-dashed cursor-pointer transition-all duration-200 ${
              isDragActive
                ? 'border-indigo-500 bg-indigo-50/60 scale-[1.01]'
                : file
                ? 'border-emerald-300 bg-emerald-50/30'
                : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20 hover:shadow-md'
            }`}
          >
            <input {...getInputProps()} />
            <div className="p-8">
              {file ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 truncate max-w-xs">{file.name}</p>
                      <p className="text-sm text-slate-400 mt-0.5 tabular-nums">{formatSize(file.size)}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs text-emerald-600 font-medium">Ready to upload</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0) }}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center transition-all duration-200 ${
                    isDragActive ? 'bg-indigo-500 scale-110' : 'bg-indigo-50'
                  }`}>
                    <Upload className={`w-6 h-6 ${isDragActive ? 'text-white' : 'text-indigo-400'}`} />
                  </div>
                  <p className="text-base font-semibold text-slate-800 mb-1">
                    {isDragActive ? 'Drop the file here!' : 'Drag & drop your recording'}
                  </p>
                  <p className="text-sm text-slate-400 mb-3">or click to browse files</p>
                  <p className="text-xs text-slate-300">MP3 · MP4 · WAV · M4A · OGG · FLAC · Max 500 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Metadata form ───────────────────────────────────────── */}
          <div className="card p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <p className="font-semibold text-slate-900 text-sm">Meeting Details</p>
            </div>

            <div>
              <label className="label">Meeting Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="e.g. Q4 Sales Review — Lagos Team"
              />
            </div>

            <div>
              <label className="label">Primary Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="input"
              >
                {LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5">
                Whisper handles code-switching automatically — "Auto-detect" works well for mixed-language meetings.
              </p>
            </div>

            {/* ── Participants ──────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label flex items-center gap-1.5 mb-0">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  Participants
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                {participantIds.length > 0 && (
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                    {participantIds.length} selected
                  </span>
                )}
              </div>

              {members.length > 0 ? (
                <>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      className="input pl-8 text-sm"
                      placeholder="Search team members…"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {filteredMembers.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">
                        No members match "{participantSearch}"
                      </p>
                    ) : (
                      filteredMembers.map((m) => {
                        const selected = participantIds.includes(m.user_id)
                        return (
                          <button
                            key={m.user_id}
                            type="button"
                            onClick={() => toggleParticipant(m.user_id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                              selected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                              selected ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {m.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{m.full_name}</p>
                              <p className="text-xs text-slate-400 truncate">{m.email}</p>
                            </div>
                            {selected && (
                              <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 py-2">
                  No other team members in this workspace yet.{' '}
                  <Link to="/settings" className="text-indigo-500 hover:underline">
                    Invite members
                  </Link>
                </p>
              )}
            </div>
          </div>

          {/* ── Upload progress ─────────────────────────────────────── */}
          {uploadMutation.isPending && progress > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between text-sm mb-2.5">
                <span className="font-medium text-slate-700">Uploading…</span>
                <span className="text-indigo-600 font-semibold tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Do not close this tab while uploading.</p>
            </div>
          )}

          {/* ── Submit button ────────────────────────────────────────── */}
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || !title.trim() || uploadMutation.isPending}
            className="btn-primary w-full py-3 text-sm"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {progress < 100 ? `Uploading ${progress}%…` : 'Processing…'}
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                Upload & Analyse with AI
              </>
            )}
          </button>

          <p className="text-xs text-slate-400 text-center">
            After upload, your meeting will be transcribed, analysed, and action items delivered via WhatsApp &amp; email.
          </p>
        </>
      )}

      {/* ══ ZOOM IMPORT MODE ════════════════════════════════════════ */}
      {mode === 'zoom' && (
        <div className="space-y-5">

          {/* How Zoom auto-import works */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Automatic Import</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Once configured, meetings import themselves — no manual steps
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { step: 'Zoom meeting ends',                detail: "Cloud recording is processed on Zoom's servers (~2–5 min)" },
                { step: 'Zoom notifies MeetingMind',        detail: 'Zoom fires a webhook with the recording download URL'      },
                { step: 'Audio is downloaded & stored',     detail: 'MeetingMind fetches the file and saves it securely'        },
                { step: 'Transcription + AI analysis runs', detail: 'Whisper transcribes, then the LLM extracts insights'       },
                { step: 'Meeting appears in your dashboard',detail: 'Summary and action items are ready, notifications sent'    },
              ].map(({ step, detail }, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5 tabular-nums">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{step}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Setup CTA */}
          <div className="card p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Setup required</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connect your Zoom account to this workspace (one-time, ~5 min)
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              {[
                'Create a free Zoom Server-to-Server OAuth app',
                'Paste your workspace webhook URL into Zoom',
                "Subscribe to the \"Recording Completed\" event",
                'Add the Secret Token to your server environment',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  <span className="text-xs text-slate-600">{item}</span>
                </div>
              ))}
            </div>

            <Link
              to="/settings"
              state={{ tab: 'integrations' }}
              className="btn-primary w-full justify-center"
            >
              <ArrowRight className="w-4 h-4" />
              Go to Settings → Integrations
            </Link>
          </div>

          {/* Requirements */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Requirements:</strong> Zoom Pro, Business, or higher plan — cloud recording
              is not available on the free Zoom tier. Your Zoom host email should match a
              MeetingMind account in this workspace.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

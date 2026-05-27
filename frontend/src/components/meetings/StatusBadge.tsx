import type { MeetingStatus } from '../../types'

const config: Record<MeetingStatus, { label: string; classes: string; pulse?: boolean }> = {
  pending:      { label: 'Pending',      classes: 'bg-slate-100 text-slate-600'    },
  uploading:    { label: 'Uploading',    classes: 'bg-sky-100 text-sky-700',         pulse: true },
  processing:   { label: 'Processing',   classes: 'bg-amber-100 text-amber-700',     pulse: true },
  transcribing: { label: 'Transcribing', classes: 'bg-violet-100 text-violet-700',   pulse: true },
  analysing:    { label: 'Analysing AI', classes: 'bg-indigo-100 text-indigo-700',   pulse: true },
  completed:    { label: 'Completed',    classes: 'bg-emerald-100 text-emerald-700' },
  failed:       { label: 'Failed',       classes: 'bg-red-100 text-red-700'         },
}

export default function StatusBadge({ status }: { status: MeetingStatus }) {
  const { label, classes, pulse } = config[status] ?? config.pending
  return (
    <span className={`status-badge ${classes}`}>
      {pulse && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  )
}

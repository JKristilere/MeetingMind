import type { MeetingStatus } from '../../types'

const config: Record<MeetingStatus, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-gray-100 text-gray-700' },
  uploading: { label: 'Uploading', classes: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', classes: 'bg-yellow-100 text-yellow-700' },
  transcribing: { label: 'Transcribing', classes: 'bg-purple-100 text-purple-700' },
  analysing: { label: 'Analysing', classes: 'bg-indigo-100 text-indigo-700' },
  completed: { label: 'Completed', classes: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', classes: 'bg-red-100 text-red-700' },
}

export default function StatusBadge({ status }: { status: MeetingStatus }) {
  const { label, classes } = config[status] ?? config.pending
  return (
    <span className={`status-badge ${classes}`}>
      {['processing', 'transcribing', 'analysing'].includes(status) && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
      )}
      {label}
    </span>
  )
}

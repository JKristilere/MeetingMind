import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { Upload, FileAudio, X, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { meetingApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const SUPPORTED = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg',
                   'audio/flac', 'audio/webm', 'video/mp4', 'video/webm']

export default function UploadPage() {
  const navigate = useNavigate()
  const currentOrgId = useAuthStore((s) => s.currentOrgId)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('auto')
  const [progress, setProgress] = useState(0)

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (f) {
      setFile(f)
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    }
  }, [title])

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
      return meetingApi.upload(currentOrgId, fd, setProgress)
    },
    onSuccess: ({ data }) => {
      toast.success('Upload complete! Processing your meeting…')
      navigate(`/meetings/${data.id}`)
    },
    onError: () => toast.error('Upload failed. Please try again.'),
  })

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (!currentOrgId) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <p className="text-gray-500">Please create an organisation first in Settings.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Meeting</h1>
        <p className="text-gray-500 text-sm mt-1">Upload an audio or video file to transcribe and analyse</p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`card p-8 border-2 border-dashed cursor-pointer transition-colors text-center ${
          isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileAudio className="w-8 h-8 text-primary-500 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 truncate max-w-xs">{file.name}</p>
                <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0) }}
              className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">
              {isDragActive ? 'Drop the file here' : 'Drag & drop your recording here'}
            </p>
            <p className="text-xs text-gray-400">MP3, MP4, WAV, M4A, OGG, FLAC · Max 500 MB</p>
          </>
        )}
      </div>

      {/* Metadata */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. Q4 Sales Review — Lagos Team"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Primary Language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input">
            <option value="auto">Auto-detect</option>
            <option value="en">English (Nigerian)</option>
            <option value="pcm">Nigerian Pidgin</option>
            <option value="yo">Yoruba</option>
            <option value="ig">Igbo</option>
            <option value="ha">Hausa</option>
            <option value="fr">French</option>
            <option value="sw">Swahili</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Whisper handles code-switching automatically — "auto" works well for mixed meetings.
          </p>
        </div>
      </div>

      {/* Upload progress */}
      {uploadMutation.isPending && progress > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <button
        onClick={() => uploadMutation.mutate()}
        disabled={!file || !title.trim() || uploadMutation.isPending}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3"
      >
        {uploadMutation.isPending ? (
          <><Loader className="w-4 h-4 animate-spin" /> Processing…</>
        ) : (
          <><Upload className="w-4 h-4" /> Upload & Analyse</>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Your meeting will be transcribed and analysed. Action items will be sent via WhatsApp and email.
      </p>
    </div>
  )
}

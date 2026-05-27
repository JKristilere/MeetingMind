export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  whatsapp_number?: string
  avatar_url?: string
  is_active: boolean
  is_verified: boolean
  created_at: string
}

export interface Organisation {
  id: string
  name: string
  slug: string
  industry?: string
  country: string
  timezone: string
  logo_url?: string
  is_active: boolean
  created_at: string
}

export type MeetingStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'transcribing'
  | 'analysing'
  | 'completed'
  | 'failed'

export type MeetingSource = 'upload' | 'zoom' | 'google_meet' | 'teams'

export interface ActionItem {
  id: string
  title: string
  description?: string
  assignee_name_raw?: string
  assignee_id?: string
  due_date?: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  created_at: string
}

export interface Transcript {
  id: string
  raw_text: string
  segments?: TranscriptSegment[]
  detected_language?: string
  confidence_score?: number
  word_count?: number
  created_at: string
}

export interface TranscriptSegment {
  start: number
  end: number
  speaker?: string
  text: string
  confidence?: number
}

export interface Meeting {
  id: string
  title: string
  description?: string
  status: MeetingStatus
  language: string
  audio_duration_seconds?: number
  original_filename?: string
  scheduled_at?: string
  started_at?: string
  ended_at?: string
  source: MeetingSource
  summary?: string
  key_decisions?: KeyDecision[]
  next_steps?: string[]
  topics_discussed?: string[]
  sentiment?: string
  meeting_effectiveness_score?: number
  error_message?: string
  host_id: string
  organisation_id: string
  created_at: string
  updated_at: string
  transcript?: Transcript
  action_items?: ActionItem[]
  participants?: Participant[]
}

export interface KeyDecision {
  decision: string
  context?: string
  decided_by?: string
}

export interface Participant {
  id: string
  name: string
  email?: string
  whatsapp_number?: string
  notified_at?: string
}

export interface OrgMember {
  id: string          // membership record id
  user_id: string
  full_name: string
  email: string
  avatar_url?: string
  role: string
  joined_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

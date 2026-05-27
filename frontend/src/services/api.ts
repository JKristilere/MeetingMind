import axios from 'axios'
import type { AuthTokens, Meeting, Organisation, OrgMember, PaginatedResponse, User } from '../types'

// In production (Vercel), VITE_API_URL points to the Render backend.
// In local dev, the Vite proxy rewrites /api → localhost:8000.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await api.post<AuthTokens>('/auth/refresh', { refresh_token: refresh })
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          original.headers.Authorization = `Bearer ${data.access_token}`
          return api(original)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

// ── Auth ──────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { full_name: string; email: string; password: string; phone?: string }) =>
    api.post<User>('/auth/register', data),

  login: (email: string, password: string) =>
    api.post<AuthTokens>('/auth/login', { email, password }),

  // Backend exposes current user at /users/me (not /auth/me)
  me: () => api.get<User>('/users/me'),
}

// ── Users ──────────────────────────────────────────────────────────────
export const userApi = {
  me: () => api.get<User>('/users/me'),
  update: (data: {
    full_name?: string
    phone?: string
    whatsapp_number?: string
    notification_prefs?: { whatsapp?: boolean; email?: boolean; in_app?: boolean }
  }) => api.patch<User>('/users/me', data),
}

// ── Organisations ─────────────────────────────────────────────────────
export const orgApi = {
  list: () => api.get<Organisation[]>('/organisations'),
  get: (id: string) => api.get<Organisation>(`/organisations/${id}`),
  create: (data: { name: string; industry?: string; country?: string; timezone?: string }) =>
    api.post<Organisation>('/organisations', data),
  update: (id: string, data: Partial<Organisation>) =>
    api.patch<Organisation>(`/organisations/${id}`, data),
  members: (id: string) => api.get<OrgMember[]>(`/organisations/${id}/members`),
  inviteMember: (id: string, email: string, role = 'member') =>
    api.post(`/organisations/${id}/members/invite`, { email, role }),
}

// ── Meetings ──────────────────────────────────────────────────────────
export const meetingApi = {
  list: (
    orgId: string,
    params?: { page?: number; page_size?: number; status?: string; search?: string },
  ) => api.get<PaginatedResponse<Meeting>>(`/meetings/${orgId}/meetings`, { params }),

  get: (orgId: string, meetingId: string) =>
    api.get<Meeting>(`/meetings/${orgId}/meetings/${meetingId}`),

  upload: (orgId: string, formData: FormData, onProgress?: (pct: number) => void) =>
    api.post<Meeting>(`/meetings/${orgId}/meetings`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    }),

  update: (orgId: string, meetingId: string, data: { title?: string; description?: string }) =>
    api.patch<Meeting>(`/meetings/${orgId}/meetings/${meetingId}`, data),

  delete: (orgId: string, meetingId: string) =>
    api.delete(`/meetings/${orgId}/meetings/${meetingId}`),

  updateActionItem: (
    orgId: string,
    meetingId: string,
    itemId: string,
    data: Record<string, unknown>,
  ) => api.patch(`/meetings/${orgId}/meetings/${meetingId}/action-items/${itemId}`, data),

  addParticipant: (
    orgId: string,
    meetingId: string,
    data: { name: string; email?: string; whatsapp_number?: string },
  ) => api.post(`/meetings/${orgId}/meetings/${meetingId}/participants`, data),
}

export default api

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  currentOrgId: string | null
  setTokens: (access: string, refresh: string) => void
  setUser: (user: User) => void
  setCurrentOrg: (orgId: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      currentOrgId: null,

      setTokens: (access, refresh) => {
        localStorage.setItem('access_token', access)
        localStorage.setItem('refresh_token', refresh)
        set({ accessToken: access, refreshToken: refresh })
      },

      setUser: (user) => set({ user }),

      setCurrentOrg: (orgId) => set({ currentOrgId: orgId }),

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, accessToken: null, refreshToken: null, currentOrgId: null })
      },

      isAuthenticated: () => !!get().accessToken && !!get().user,
    }),
    { name: 'meetingmind-auth', partialize: (s) => ({ currentOrgId: s.currentOrgId }) },
  ),
)

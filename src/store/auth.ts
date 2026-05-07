'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthClinic, AuthUser } from '@/types'

interface AuthState {
  clinic: AuthClinic | null
  user: AuthUser | null
  _hydrated: boolean
  setSession: (clinic: AuthClinic, user: AuthUser) => void
  clearSession: () => void
  setHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clinic: null,
      user: null,
      _hydrated: false,
      setSession: (clinic, user) => set({ clinic, user }),
      clearSession: () => set({ clinic: null, user: null }),
      setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: 'myclinica-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
      },
    }
  )
)

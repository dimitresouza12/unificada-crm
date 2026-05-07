'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthClinic, AuthUser } from '@/types'

interface AuthState {
  clinic: AuthClinic | null
  user: AuthUser | null
  setSession: (clinic: AuthClinic, user: AuthUser) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clinic: null,
      user: null,
      setSession: (clinic, user) => set({ clinic, user }),
      clearSession: () => set({ clinic: null, user: null }),
    }),
    { name: 'myclinica-auth' }
  )
)

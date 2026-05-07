'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AppSidebar } from '@/components/layout/AppSidebar'
import styles from './app.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { clinic, user, _hydrated } = useAuthStore()

  useEffect(() => {
    if (_hydrated && (!clinic || !user)) {
      router.replace('/login')
    }
  }, [_hydrated, clinic, user, router])

  // Aguarda hidratação do Zustand antes de renderizar ou redirecionar
  if (!_hydrated) return null

  if (!clinic || !user) return null

  return (
    <div className={styles.shell}>
      <AppSidebar clinic={clinic} user={user} />
      <main className={styles.main}>{children}</main>
    </div>
  )
}

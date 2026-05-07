'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AppSidebar } from '@/components/layout/AppSidebar'
import styles from './app.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { clinic, user } = useAuthStore()

  useEffect(() => {
    if (!clinic || !user) router.replace('/login')
  }, [clinic, user, router])

  if (!clinic || !user) return null

  return (
    <div className={styles.shell}>
      <AppSidebar clinic={clinic} user={user} />
      <main className={styles.main}>{children}</main>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { Icon } from '@/components/ui/Icon'
import styles from './app.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { clinic, user, _hydrated } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (_hydrated && (!clinic || !user)) {
      router.replace('/login')
    }
  }, [_hydrated, clinic, user, router])

  if (!_hydrated) return null
  if (!clinic || !user) return null

  return (
    <div className={styles.shell}>
      {sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      <AppSidebar
        clinic={clinic}
        user={user}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {!sidebarOpen && (
        <button
          className={styles.mobileMenu}
          onClick={() => setSidebarOpen(true)}
          aria-label="Menu"
        >
          <Icon name="menu" size={22} />
        </button>
      )}

      <div className={styles.content}>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}

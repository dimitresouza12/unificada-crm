'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { AuthClinic, AuthUser } from '@/types'
import styles from './AppSidebar.module.css'

const NAV = [
  { path: '/dashboard',     label: 'Dashboard',     icon: '◈' },
  { path: '/pacientes',     label: 'Pacientes',      icon: '👥' },
  { path: '/agenda',        label: 'Agenda',          icon: '📅' },
  { path: '/financeiro',    label: 'Financeiro',      icon: '💰' },
  { path: '/equipe',        label: 'Equipe',          icon: '🩺' },
  { path: '/configuracoes', label: 'Configurações',   icon: '⚙️' },
]

export function AppSidebar({ clinic, user }: { clinic: AuthClinic; user: AuthUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const clearSession = useAuthStore((s) => s.clearSession)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clearSession()
    router.replace('/login')
  }

  const navItems = user.isSuperAdmin
    ? [...NAV, { path: '/admin', label: 'Admin', icon: '🛡️' }]
    : NAV

  return (
    <aside className={styles.sidebar} style={{ '--clinic-color': clinic.color } as React.CSSProperties}>
      <div className={styles.brand}>
        {clinic.logo ? (
          <img src={clinic.logo} alt={clinic.name} className={styles.logo} />
        ) : (
          <span className={styles.logoText}>My<strong>Clinica</strong></span>
        )}
        <span className={styles.clinicName}>{clinic.name}</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          const active = pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user.displayName}</span>
          <span className={styles.userRole}>{user.role}</span>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn} title="Sair">
          ⏻
        </button>
      </div>
    </aside>
  )
}

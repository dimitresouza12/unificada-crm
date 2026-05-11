'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useTheme } from '@/hooks/useTheme'
import { Icon } from '@/components/ui/Icon'
import type { AuthClinic, AuthUser } from '@/types'
import styles from './AppSidebar.module.css'

const NAV = [
  { path: '/dashboard',     label: 'Dashboard',     icon: 'dashboard'  as const },
  { path: '/pacientes',     label: 'Pacientes',     icon: 'patients'   as const },
  { path: '/agenda',        label: 'Agenda',        icon: 'calendar'   as const },
  { path: '/financeiro',    label: 'Financeiro',    icon: 'finance'    as const },
  { path: '/equipe',        label: 'Equipe',        icon: 'team'       as const },
  { path: '/crm',           label: 'CRM',           icon: 'crm'        as const },
  { path: '/configuracoes', label: 'Configurações', icon: 'settings'   as const },
]

interface Props {
  clinic: AuthClinic
  user: AuthUser
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AppSidebar({ clinic, user, mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const clearSession = useAuthStore((s) => s.clearSession)
  const { theme, toggle: toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    clearSession()
    router.replace('/login')
  }

  const navItems = user.isSuperAdmin
    ? [...NAV, { path: '/admin', label: 'Admin', icon: 'admin' as const }]
    : NAV

  const initials = user.displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <aside
      className={[
        styles.sidebar,
        collapsed ? styles.collapsed : '',
        mobileOpen ? styles.mobileOpen : '',
      ].join(' ')}
      style={{ '--clinic-color': clinic.color } as React.CSSProperties}
    >
      <div className={`${styles.brand} ${collapsed ? styles.brandCollapsed : ''}`}>
        <div className={styles.brandTop}>
          {collapsed ? (
            <span className={styles.logoText}><strong>M</strong></span>
          ) : (
            <span className={styles.logoText}>My<strong>Clinica</strong></span>
          )}
        </div>
        {!collapsed && <span className={styles.clinicName}>{clinic.name}</span>}
      </div>

      <button
        className={`${styles.collapseBtn} ${collapsed ? styles.collapseBtnCenter : ''}`}
        onClick={toggleCollapse}
        title={collapsed ? 'Expandir' : 'Recolher'}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
      </button>

      <nav className={`${styles.nav} ${collapsed ? styles.navCollapsed : ''}`}>
        {navItems.map((item) => {
          const active = pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`${styles.navItem} ${active ? styles.active : ''} ${collapsed ? styles.navItemCollapsed : ''}`}
              title={collapsed ? item.label : undefined}
              onClick={onMobileClose}
            >
              <span className={styles.iconWrap}>
                <Icon name={item.icon} size={16} />
              </span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={`${styles.footer} ${collapsed ? styles.footerCollapsed : ''}`}>
        <button className={styles.themeBtn} onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
        {!collapsed && (
          <>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.displayName}</span>
              <span className={styles.userRole}>{user.role}</span>
            </div>
          </>
        )}
        <button onClick={handleLogout} className={styles.logoutBtn} title="Sair">
          <Icon name="logout" size={15} />
        </button>
      </div>
    </aside>
  )
}

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
  { path: '/dashboard',     label: 'Dashboard',     icon: 'dashboard'  as const, plusOnly: false },
  { path: '/pacientes',     label: 'Pacientes',     icon: 'patients'   as const, plusOnly: false },
  { path: '/agenda',        label: 'Agenda',        icon: 'calendar'   as const, plusOnly: false },
  { path: '/financeiro',    label: 'Financeiro',    icon: 'finance'    as const, plusOnly: false },
  { path: '/estoque',       label: 'Estoque',       icon: 'stock'      as const, plusOnly: false },
  { path: '/equipe',        label: 'Equipe',        icon: 'team'       as const, plusOnly: false },
  { path: '/crm',           label: 'CRM',           icon: 'crm'        as const, plusOnly: true  },
  { path: '/configuracoes', label: 'Configurações', icon: 'settings'   as const, plusOnly: false },
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
    try {
      window.localStorage.removeItem('myclinica-auth')
      // Limpa também a sessão do Supabase Auth para evitar JWT residual
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch { /* ignore */ }
    // Hard navigation para garantir reset completo de qualquer estado em memória
    window.location.href = '/login'
  }

  const isPlus = clinic.plan === 'plus'
  const filteredNav = NAV.filter((item) => !item.plusOnly || isPlus)
  const navItems = user.isSuperAdmin
    ? [...filteredNav, { path: '/admin', label: 'Admin', icon: 'admin' as const, plusOnly: false }]
    : filteredNav

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
            <img src="/favicon.svg" alt="MyClinica" className={styles.brandIcon} />
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

      {!collapsed && (
        <button className={styles.themeRow} onClick={toggleTheme}>
          <span className={styles.themeIconWrap}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </span>
          <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
        </button>
      )}

      <div className={`${styles.footer} ${collapsed ? styles.footerCollapsed : ''}`}>
        {collapsed && (
          <button className={styles.themeBtn} onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        )}
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

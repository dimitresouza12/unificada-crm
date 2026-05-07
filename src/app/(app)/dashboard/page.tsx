'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Appointment, FinancialRecord } from '@/types'
import styles from './dashboard.module.css'

interface Stats {
  totalPatients: number
  appointmentsToday: number
  monthRevenue: number
  pendingAppointments: number
}

export default function DashboardPage() {
  const { clinic, user } = useAuthStore()
  const [stats, setStats] = useState<Stats>({ totalPatients: 0, appointmentsToday: 0, monthRevenue: 0, pendingAppointments: 0 })
  const [recentAppts, setRecentAppts] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clinic) return
    loadDashboard()
  }, [clinic])

  async function loadDashboard() {
    if (!clinic) return
    const today = new Date()
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

    const [patientsRes, todayApptRes, pendingRes, revenueRes, recentRes] = await Promise.all([
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).eq('is_active', true),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).gte('scheduled_at', startOfDay).lte('scheduled_at', endOfDay),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).eq('status', 'agendado'),
      supabase.from('financial_records').select('total_amount').eq('clinic_id', clinic.id).gte('created_at', startOfMonth),
      supabase.from('appointments').select('*, patients(name, phone)').eq('clinic_id', clinic.id).order('scheduled_at', { ascending: false }).limit(8),
    ])

    const monthRevenue = ((revenueRes.data ?? []) as Pick<FinancialRecord, 'total_amount'>[])
      .reduce((sum, r) => sum + (r.total_amount ?? 0), 0)

    setStats({
      totalPatients: patientsRes.count ?? 0,
      appointmentsToday: todayApptRes.count ?? 0,
      pendingAppointments: pendingRes.count ?? 0,
      monthRevenue,
    })
    setRecentAppts((recentRes.data ?? []) as Appointment[])
    setLoading(false)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const cards = [
    { label: 'Pacientes ativos',     value: stats.totalPatients,                    icon: '👥', color: '#7C3AED' },
    { label: 'Consultas hoje',        value: stats.appointmentsToday,                icon: '📅', color: '#0EA5E9' },
    { label: 'Agendamentos abertos', value: stats.pendingAppointments,               icon: '⏳', color: '#F59E0B' },
    { label: 'Receita do mês',       value: formatCurrency(stats.monthRevenue),      icon: '💰', color: '#10B981' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{greeting}, {user?.displayName?.split(' ')[0]}</h1>
        <p className={styles.subtitle}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <>
          <div className={styles.cards}>
            {cards.map((c) => (
              <div key={c.label} className={styles.card} style={{ '--card-accent': c.color } as React.CSSProperties}>
                <div className={styles.cardIconWrap}>{c.icon}</div>
                <div className={styles.cardBody}>
                  <span className={styles.cardValue}>{c.value}</span>
                  <span className={styles.cardLabel}>{c.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Próximos agendamentos</h2>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Procedimento</th>
                    <th>Data</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAppts.length === 0 ? (
                    <tr><td colSpan={4} className={styles.empty}>Nenhum agendamento encontrado.</td></tr>
                  ) : recentAppts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.patients?.name ?? '-'}</td>
                      <td>{a.procedure_name ?? '-'}</td>
                      <td>{formatDate(a.scheduled_at)}</td>
                      <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

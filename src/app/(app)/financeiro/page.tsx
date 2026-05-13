'use client'
import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { FinancialRecord, Patient } from '@/types'
import styles from './financeiro.module.css'

// Recharts – dynamic import to avoid SSR issues
const Charts = dynamic(() => import('./FinanceiroCharts'), { ssr: false, loading: () => <div className={styles.chartLoading}>Carregando gráficos...</div> })

const CATEGORIAS_RECEITA = ['Consulta', 'Procedimento', 'Exame', 'Plano', 'Outros']
const CATEGORIAS_DESPESA = ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros']

interface NewRecord {
  type: 'receita' | 'despesa'
  patient_id: string
  total_amount: string
  payment_method: string
  category: string
  notes: string
}
const BLANK: NewRecord = { type: 'receita', patient_id: '', total_amount: '', payment_method: 'pix', category: '', notes: '' }

export default function FinanceiroPage() {
  const { clinic } = useAuthStore()
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'receita' | 'despesa'>('receita')
  const [form, setForm] = useState<NewRecord>(BLANK)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica
    setRecords([])
    setPatients([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    const [recRes, patRes] = await Promise.all([
      supabase.from('financial_records').select('*, patients(id, name)')
        .eq('clinic_id', clinic.id).order('created_at', { ascending: false }),
      supabase.from('patients').select('id, name').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
    ])
    setRecords((recRes.data ?? []) as FinancialRecord[])
    setPatients((patRes.data ?? []) as Patient[])
    setLoading(false)
  }

  const stats = useMemo(() => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthly = records.filter(r => r.created_at?.startsWith(monthStr))
    const receitas = monthly.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const despesas = monthly.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    return { receitas, despesas, saldo: receitas - despesas, count: monthly.length }
  }, [records])

  // Build monthly data for last 6 months
  const monthlyData = useMemo(() => {
    const months: { month: string; receita: number; despesa: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const monthRecords = records.filter(r => r.created_at?.startsWith(key))
      months.push({
        month: label,
        receita: monthRecords.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0),
        despesa: monthRecords.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0),
      })
    }
    return months
  }, [records])

  // Category breakdown for current month
  const categoryData = useMemo(() => {
    const monthStr = filterMonth
    const monthly = records.filter(r => r.created_at?.startsWith(monthStr) && r.type === 'receita')
    const map: Record<string, number> = {}
    monthly.forEach(r => {
      const k = r.category ?? 'Outros'
      map[k] = (map[k] ?? 0) + (r.total_amount ?? 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [records, filterMonth])

  const filtered = records.filter(r => {
    const matchType = filterType === 'todos' || r.type === filterType
    const matchMonth = !filterMonth || r.created_at?.startsWith(filterMonth)
    return matchType && matchMonth
  })

  function openModal(type: 'receita' | 'despesa') {
    setModalType(type)
    setForm({ ...BLANK, type, category: type === 'receita' ? 'Consulta' : 'Material' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!clinic) return
    setSaving(true)
    await supabase.from('financial_records').insert([{
      clinic_id: clinic.id,
      patient_id: form.patient_id || null,
      total_amount: parseFloat(form.total_amount) || 0,
      payment_method: form.payment_method,
      category: form.category,
      notes: form.notes,
      type: form.type,
    }])
    setSaving(false)
    setShowModal(false)
    setForm(BLANK)
    loadData()
  }

  const categorias = form.type === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Financeiro</h1>
          <p className={styles.sub}>{filtered.length} lançamentos em {new Date(filterMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnDespesa} onClick={() => openModal('despesa')}>− Despesa</button>
          <button className={styles.btnReceita} onClick={() => openModal('receita')}>+ Receita</button>
        </div>
      </div>

      {/* Metric cards */}
      <div className={styles.cards}>
        <div className={styles.card} style={{ '--c': '#10B981' } as React.CSSProperties}>
          <div className={styles.cardIcon} style={{ background: '#ECFDF5' }}>📈</div>
          <div className={styles.cardBody}>
            <span className={styles.cardValue}>{formatCurrency(stats.receitas)}</span>
            <span className={styles.cardLabel}>Receitas do mês</span>
          </div>
        </div>
        <div className={styles.card} style={{ '--c': '#EF4444' } as React.CSSProperties}>
          <div className={styles.cardIcon} style={{ background: '#FEF2F2' }}>📉</div>
          <div className={styles.cardBody}>
            <span className={styles.cardValue}>{formatCurrency(stats.despesas)}</span>
            <span className={styles.cardLabel}>Despesas do mês</span>
          </div>
        </div>
        <div className={styles.card} style={{ '--c': stats.saldo >= 0 ? '#0D9488' : '#F59E0B' } as React.CSSProperties}>
          <div className={styles.cardIcon} style={{ background: stats.saldo >= 0 ? '#F0FDFA' : '#FFFBEB' }}>💰</div>
          <div className={styles.cardBody}>
            <span className={styles.cardValue} style={{ color: stats.saldo >= 0 ? '#059669' : '#DC2626' }}>
              {formatCurrency(stats.saldo)}
            </span>
            <span className={styles.cardLabel}>Saldo do mês</span>
          </div>
        </div>
        <div className={styles.card} style={{ '--c': '#0EA5E9' } as React.CSSProperties}>
          <div className={styles.cardIcon} style={{ background: '#F0F9FF' }}>🧾</div>
          <div className={styles.cardBody}>
            <span className={styles.cardValue}>{stats.count}</span>
            <span className={styles.cardLabel}>Lançamentos</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      {!loading && <Charts monthlyData={monthlyData} categoryData={categoryData} />}

      {/* Filters + Table */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.filterTabs}>
            {(['todos', 'receita', 'despesa'] as const).map(t => (
              <button key={t} className={`${styles.filterTab} ${filterType === t ? styles.filterTabActive : ''}`} onClick={() => setFilterType(t)}>
                {t === 'todos' ? 'Todos' : t === 'receita' ? '📈 Receitas' : '📉 Despesas'}
              </button>
            ))}
          </div>
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className={styles.monthInput}
          />
        </div>
        {loading ? <p className={styles.loading}>Carregando...</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Método</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className={styles.empty}>Nenhum lançamento encontrado.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={r.type === 'receita' ? styles.tagReceita : styles.tagDespesa}>
                        {r.type === 'receita' ? '↑ Receita' : '↓ Despesa'}
                      </span>
                    </td>
                    <td>{formatDate(r.created_at, true)}</td>
                    <td>{r.patients?.name ?? '—'}</td>
                    <td>{r.category ?? '—'}</td>
                    <td>{r.notes ?? '—'}</td>
                    <td className={styles.method}>{r.payment_method ?? '—'}</td>
                    <td className={r.type === 'receita' ? styles.valuePos : styles.valueNeg}>
                      {r.type === 'despesa' ? '−' : '+'}{formatCurrency(r.total_amount ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{form.type === 'receita' ? '📈 Nova Receita' : '📉 Nova Despesa'}</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Valor (R$) *</label>
                <input type="number" step="0.01" min="0" value={form.total_amount}
                  onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} placeholder="0,00" />
              </div>
              <div className={styles.field}>
                <label>Categoria</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {form.type === 'receita' && (
                <div className={styles.field}>
                  <label>Paciente</label>
                  <select value={form.patient_id} onChange={e => setForm(p => ({ ...p, patient_id: e.target.value }))}>
                    <option value="">Sem paciente</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className={styles.field}>
                <label>Método de Pagamento</label>
                <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="convenio">Convênio</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Descrição</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Detalhe o lançamento..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={form.type === 'receita' ? styles.btnSaveReceita : styles.btnSaveDespesa}
                onClick={handleSave} disabled={saving || !form.total_amount}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

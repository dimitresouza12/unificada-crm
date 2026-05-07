'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { FinancialRecord, Patient } from '@/types'
import styles from './financeiro.module.css'

interface NewRecord { patient_id: string; total_amount: string; payment_method: string; notes: string }
const BLANK: NewRecord = { patient_id: '', total_amount: '', payment_method: 'pix', notes: '' }

export default function FinanceiroPage() {
  const { clinic } = useAuthStore()
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewRecord>(BLANK)
  const [saving, setSaving] = useState(false)

  const totalMonth = records.reduce((s, r) => s + (r.total_amount ?? 0), 0)

  useEffect(() => {
    if (clinic) loadData()
  }, [clinic])

  async function loadData() {
    if (!clinic) return
    // supabase singleton
    const [recRes, patRes] = await Promise.all([
      supabase.from('financial_records').select('*, patients(id, name)').eq('clinic_id', clinic.id).order('created_at', { ascending: false }),
      supabase.from('patients').select('id, name').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
    ])
    setRecords((recRes.data ?? []) as FinancialRecord[])
    setPatients((patRes.data ?? []) as Patient[])
    setLoading(false)
  }

  async function handleSave() {
    if (!clinic) return
    setSaving(true)
    // supabase singleton
    await supabase.from('financial_records').insert([{
      clinic_id: clinic.id,
      patient_id: form.patient_id || null,
      total_amount: parseFloat(form.total_amount) || 0,
      payment_method: form.payment_method,
      notes: form.notes,
    }])
    setSaving(false)
    setShowModal(false)
    setForm(BLANK)
    loadData()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Financeiro</h1>
          <p className={styles.sub}>{records.length} lançamentos · {formatCurrency(totalMonth)} total</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>+ Novo Lançamento</button>
      </div>

      {loading ? <p className={styles.loading}>Carregando...</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Paciente</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Método</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>Nenhum lançamento encontrado.</td></tr>
              ) : records.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.created_at, true)}</td>
                  <td>{r.patients?.name ?? 'Avulso'}</td>
                  <td>{r.notes ?? '-'}</td>
                  <td className={styles.value}>{formatCurrency(r.total_amount)}</td>
                  <td>{r.payment_method ?? '-'}</td>
                  <td><span className="status-badge status-concluido">Recebido</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Novo Lançamento</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Paciente</label>
                <select value={form.patient_id} onChange={(e) => setForm((p) => ({ ...p, patient_id: e.target.value }))}>
                  <option value="">Avulso (sem paciente)</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Valor (R$) *</label>
                <input type="number" step="0.01" min="0" value={form.total_amount} onChange={(e) => setForm((p) => ({ ...p, total_amount: e.target.value }))} placeholder="0,00" />
              </div>
              <div className={styles.field}>
                <label>Método de Pagamento</label>
                <select value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="convenio">Convênio</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Descrição / Procedimento</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Ex: Consulta, Limpeza..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.total_amount}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

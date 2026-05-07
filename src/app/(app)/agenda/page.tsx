'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone } from '@/lib/utils'
import type { Appointment, Patient, Professional } from '@/types'
import styles from './agenda.module.css'

interface NewAppt {
  patient_id: string
  professional_id: string
  procedure_name: string
  scheduled_at: string
  duration_minutes: number
  status: string
  notes: string
}

const BLANK: NewAppt = {
  patient_id: '', professional_id: '', procedure_name: '',
  scheduled_at: '', duration_minutes: 60, status: 'agendado', notes: '',
}

export default function AgendaPage() {
  const { clinic } = useAuthStore()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewAppt>(BLANK)
  const [saving, setSaving] = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)

  useEffect(() => {
    if (clinic) loadData()
  }, [clinic])

  async function loadData() {
    if (!clinic) return
    const supabase = createClient()
    const [apptRes, patRes, profRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, patients(id, name, phone), clinic_users(id, display_name)')
        .eq('clinic_id', clinic.id)
        .order('scheduled_at', { ascending: false }),
      supabase.from('patients').select('id, name, phone').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
      supabase.from('professionals').select('*').eq('clinic_id', clinic.id).order('name'),
    ])
    setAppointments((apptRes.data ?? []) as Appointment[])
    setPatients((patRes.data ?? []) as Patient[])
    setProfessionals((profRes.data ?? []) as Professional[])
    setLoading(false)
  }

  const filtered = appointments.filter((a) => {
    const matchStatus = !filterStatus || a.status === filterStatus
    const matchDate = !filterDate || a.scheduled_at?.startsWith(filterDate)
    return matchStatus && matchDate
  })

  async function handleSave() {
    if (!clinic || !form.patient_id || !form.scheduled_at) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('appointments').insert([{ ...form, clinic_id: clinic.id }])
    setSaving(false)
    setShowModal(false)
    setForm(BLANK)
    loadData()
  }

  async function updateStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('appointments').update({ status }).eq('id', id)
    loadData()
    setSelected(null)
  }

  function openGCal(appt: Appointment) {
    const start = new Date(appt.scheduled_at)
    const end = new Date(start.getTime() + (appt.duration_minutes ?? 60) * 60000)
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('.000', '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(appt.procedure_name ?? 'Consulta')}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`Paciente: ${appt.patients?.name ?? ''}\nTelefone: ${appt.patients?.phone ?? ''}`)}`
    window.open(url, '_blank')
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Agenda</h1>
          <p className={styles.sub}>{filtered.length} agendamentos</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
          + Novo Agendamento
        </button>
      </div>

      <div className={styles.filters}>
        <input
          type="date"
          className={styles.input}
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
        <select className={styles.input} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="agendado">Agendado</option>
          <option value="confirmado">Confirmado</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
          <option value="faltou">Faltou</option>
        </select>
        {(filterDate || filterStatus) && (
          <button className={styles.btnClear} onClick={() => { setFilterDate(''); setFilterStatus('') }}>
            Limpar
          </button>
        )}
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Procedimento</th>
                <th>Profissional</th>
                <th>Data</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>Nenhum agendamento encontrado.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className={styles.row} onClick={() => setSelected(a)}>
                  <td className={styles.bold}>{a.patients?.name ?? '-'}</td>
                  <td>{formatPhone(a.patients?.phone)}</td>
                  <td>{a.procedure_name ?? '-'}</td>
                  <td>{a.clinic_users?.display_name ?? '-'}</td>
                  <td>{formatDate(a.scheduled_at)}</td>
                  <td><span className={`status-badge status-${a.status ?? 'pendente'}`}>{a.status ?? 'pendente'}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className={styles.btnGcal} onClick={() => openGCal(a)} title="Abrir no Google Calendar">
                      📅 GCal
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className={styles.overlay} onClick={() => setSelected(null)}>
          <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h3>{selected.patients?.name ?? 'Agendamento'}</h3>
              <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className={styles.detailBody}>
              <Row label="Procedimento" value={selected.procedure_name ?? '-'} />
              <Row label="Data" value={formatDate(selected.scheduled_at)} />
              <Row label="Duração" value={`${selected.duration_minutes} min`} />
              <Row label="Telefone" value={formatPhone(selected.patients?.phone)} />
              <Row label="Status atual" value={selected.status ?? '-'} />
              {selected.notes && <Row label="Observações" value={selected.notes} />}
            </div>
            <div className={styles.detailActions}>
              <p className={styles.detailActionsLabel}>Alterar status:</p>
              <div className={styles.statusBtns}>
                {['agendado','confirmado','concluido','cancelado','faltou'].map((s) => (
                  <button
                    key={s}
                    className={`${styles.statusBtn} ${selected.status === s ? styles.statusBtnActive : ''}`}
                    onClick={() => updateStatus(selected.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button className={styles.btnGcalLarge} onClick={() => openGCal(selected)}>
                📅 Abrir no Google Calendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New appointment modal */}
      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Novo Agendamento</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Paciente *</label>
                <select value={form.patient_id} onChange={(e) => setForm((p) => ({ ...p, patient_id: e.target.value }))}>
                  <option value="">Selecionar paciente</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Profissional</label>
                <select value={form.professional_id} onChange={(e) => setForm((p) => ({ ...p, professional_id: e.target.value }))}>
                  <option value="">Sem profissional</option>
                  {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Procedimento</label>
                <input value={form.procedure_name} onChange={(e) => setForm((p) => ({ ...p, procedure_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Data e Hora *</label>
                <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Duração (min)</label>
                <input type="number" value={form.duration_minutes} onChange={(e) => setForm((p) => ({ ...p, duration_minutes: Number(e.target.value) }))} min={15} step={15} />
              </div>
              <div className={styles.field}>
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="agendado">Agendado</option>
                  <option value="confirmado">Confirmado</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Observações</label>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.patient_id || !form.scheduled_at}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

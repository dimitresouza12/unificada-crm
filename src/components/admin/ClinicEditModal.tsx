'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Clinic, ClinicStatus } from '@/types'
import styles from './admin.module.css'

const PLANS = ['trial', 'basico', 'pro', 'premium']
const STATUSES: { value: ClinicStatus; label: string }[] = [
  { value: 'active',    label: 'Ativa' },
  { value: 'inactive',  label: 'Inativa' },
  { value: 'suspended', label: 'Suspensa (inadimplência)' },
]

interface Props {
  clinic: Clinic
  onClose: () => void
  onSaved: () => void
}

export function ClinicEditModal({ clinic, onClose, onSaved }: Props) {
  const [plan, setPlan] = useState(clinic.plan ?? 'basico')
  const [maxPatients, setMaxPatients] = useState(clinic.max_patients ?? 200)
  const [status, setStatus] = useState<ClinicStatus>(clinic.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('clinics')
      .update({ plan, max_patients: maxPatients, status, is_active: status === 'active' })
      .eq('id', clinic.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Editar clínica: {clinic.name}</h2>
          <button className={styles.btnClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Plano</label>
            <div className={styles.planGrid}>
              {PLANS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.planBtn} ${plan === p ? styles.planBtnActive : ''}`}
                  onClick={() => setPlan(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>Limite de pacientes</label>
            <input
              type="number"
              min={10}
              step={50}
              value={maxPatients}
              onChange={(e) => setMaxPatients(Number(e.target.value))}
              className={styles.fieldInput}
            />
          </div>

          <div className={styles.field}>
            <label>Status</label>
            <div className={styles.statusBtnGroup}>
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`${styles.statusChoiceBtn} ${status === s.value ? styles.statusChoiceBtnActive : ''} ${styles[`statusChoice_${s.value}`]}`}
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className={styles.fieldError}>{error}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

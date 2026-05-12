'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabOdontograma.module.css'

const TOOTH_STATUS = [
  { key: 'higido', label: 'Hígido', color: '#10b981' },
  { key: 'cariado', label: 'Cariado', color: '#ef4444' },
  { key: 'restaurado', label: 'Restaurado', color: '#3b82f6' },
  { key: 'extraido', label: 'Extraído', color: '#6b7280' },
  { key: 'implante', label: 'Implante', color: '#f59e0b' },
  { key: 'coroa', label: 'Coroa', color: '#14B8A6' },
  { key: 'tratamento', label: 'Em Tratamento', color: '#ec4899' },
]

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

interface Props {
  record: MedicalRecord | null
  patient: Patient
  clinicId: string
  onSaved: () => void
}

export function TabOdontograma({ record, patient, clinicId, onSaved }: Props) {
  const [odontogram, setOdontogram] = useState<Record<string, string>>({})
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setOdontogram(record?.odontogram ?? {})
  }, [record])

  function selectStatus(status: string) {
    if (selectedTooth === null) return
    setOdontogram((prev) => ({ ...prev, [selectedTooth]: status }))
    setSelectedTooth(null)
  }

  async function handleSave() {
    setSaving(true)
    // supabase singleton
    const payload = { clinic_id: clinicId, patient_id: patient.id, odontogram, updated_at: new Date().toISOString() }
    if (record?.id) {
      await supabase.from('medical_records').update(payload).eq('id', record.id)
    } else {
      await supabase.from('medical_records').insert([payload])
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setSaving(false)
    onSaved()
  }

  function getColor(num: number) {
    const status = odontogram[num] ?? 'higido'
    return TOOTH_STATUS.find((s) => s.key === status)?.color ?? '#10b981'
  }

  function renderTeeth(teeth: number[]) {
    return teeth.map((num) => (
      <button
        key={num}
        className={`${styles.tooth} ${selectedTooth === num ? styles.toothSelected : ''}`}
        style={{ '--tooth-color': getColor(num) } as React.CSSProperties}
        onClick={() => setSelectedTooth(selectedTooth === num ? null : num)}
        title={`Dente ${num}: ${odontogram[num] ?? 'hígido'}`}
      >
        <span className={styles.toothNum}>{num}</span>
      </button>
    ))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        {TOOTH_STATUS.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className={styles.arcada}>
        <p className={styles.arcadaLabel}>Superior</p>
        <div className={styles.teeth}>{renderTeeth(UPPER)}</div>
        <div className={styles.teeth}>{renderTeeth(LOWER)}</div>
        <p className={styles.arcadaLabel}>Inferior</p>
      </div>

      {selectedTooth !== null && (
        <div className={styles.selector}>
          <p className={styles.selectorTitle}>Dente {selectedTooth} — selecione o status:</p>
          <div className={styles.selectorBtns}>
            {TOOTH_STATUS.map((s) => (
              <button
                key={s.key}
                className={styles.selectorBtn}
                style={{ background: s.color }}
                onClick={() => selectStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.saveRow}>
        {saved && <span className={styles.savedMsg}>✓ Salvo!</span>}
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Odontograma'}
        </button>
      </div>
    </div>
  )
}

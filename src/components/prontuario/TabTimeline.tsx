'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import styles from './TabTimeline.module.css'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinicId: string
  onSaved: () => void
}

export function TabTimeline({ patient, record, entries, clinicId, onSaved }: Props) {
  const { user } = useAuthStore()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAddEntry() {
    if (!text.trim()) return
    setSaving(true)
    const supabase = createClient()
    try {
      let recordId = record?.id
      if (!recordId) {
        const { data } = await supabase
          .from('medical_records')
          .insert([{ clinic_id: clinicId, patient_id: patient.id }])
          .select('id')
          .single()
        recordId = data?.id
      }
      if (!recordId) throw new Error('Falha ao criar prontuário.')
      await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: text.trim(),
        author_name: user?.displayName ?? 'Sistema',
        entry_type: 'evolucao',
      }])
      setText('')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.newEntry}>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="Adicionar anotação clínica..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className={styles.btnAdd}
          onClick={handleAddEntry}
          disabled={saving || !text.trim()}
        >
          {saving ? 'Salvando...' : '+ Adicionar Anotação'}
        </button>
      </div>

      <div className={styles.timeline}>
        {entries.length === 0 ? (
          <p className={styles.empty}>Nenhuma anotação ainda. Adicione a primeira acima.</p>
        ) : entries.map((entry) => (
          <div key={entry.id} className={styles.item}>
            <div className={styles.itemDate}>{formatDate(entry.created_at)}</div>
            <div className={styles.itemCard}>
              <p className={styles.itemText}>{entry.entry_text}</p>
              {entry.author_name && (
                <span className={styles.itemAuthor}>por {entry.author_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

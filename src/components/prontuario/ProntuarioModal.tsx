'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import type { AuthClinic } from '@/types'
import { TabFicha } from './TabFicha'
import { TabOdontograma } from './TabOdontograma'
import { TabTimeline } from './TabTimeline'
import { TabChatIA } from './TabChatIA'
import styles from './ProntuarioModal.module.css'

type Tab = 'ficha' | 'odontograma' | 'timeline' | 'chat'

interface Props {
  patient: Patient
  clinic: AuthClinic
  onClose: () => void
}

export function ProntuarioModal({ patient, clinic, onClose }: Props) {
  const clinicId = clinic.id
  const clinicName = clinic.name
  const [tab, setTab] = useState<Tab>('ficha')
  const [record, setRecord] = useState<MedicalRecord | null>(null)
  const [entries, setEntries] = useState<RecordEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecord()
  }, [patient.id])

  async function loadRecord() {
    setLoading(true)
    const [recRes, entriesRes] = await Promise.all([
      supabase.from('medical_records').select('*').eq('patient_id', patient.id).maybeSingle<MedicalRecord>(),
      supabase.from('record_entries').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    ])
    setRecord(recRes.data ?? null)
    setEntries((entriesRes.data ?? []) as RecordEntry[])
    setLoading(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ficha', label: '📋 Ficha Clínica' },
    { key: 'odontograma', label: '🦷 Odontograma' },
    { key: 'timeline', label: '📝 Evolução' },
    { key: 'chat', label: '💬 Chat IA' },
  ]

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Prontuário</h2>
            <p className={styles.patientName}>{patient.name}</p>
          </div>
          <button className={styles.btnClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`${styles.tabBtn} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {loading ? (
            <p className={styles.loading}>Carregando prontuário...</p>
          ) : (
            <>
              {tab === 'ficha' && (
                <TabFicha
                  patient={patient}
                  record={record}
                  entries={entries}
                  clinic={clinic}
                  clinicId={clinicId}
                  clinicName={clinicName}
                  onSaved={loadRecord}
                />
              )}
              {tab === 'odontograma' && (
                <TabOdontograma
                  record={record}
                  patient={patient}
                  clinicId={clinicId}
                  onSaved={loadRecord}
                />
              )}
              {tab === 'timeline' && (
                <TabTimeline
                  patient={patient}
                  record={record}
                  entries={entries}
                  clinicId={clinicId}
                  onSaved={loadRecord}
                />
              )}
              {tab === 'chat' && (
                <TabChatIA phone={patient.phone} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

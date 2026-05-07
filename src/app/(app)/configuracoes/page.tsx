'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import styles from './configuracoes.module.css'

export default function ConfiguracoesPage() {
  const { clinic, user, setSession } = useAuthStore()
  const [name, setName] = useState(clinic?.name ?? '')
  const [address, setAddress] = useState(clinic?.address ?? '')
  const [phone, setPhone] = useState(clinic?.phone ?? '')
  const [color, setColor] = useState(clinic?.color ?? '#7C3AED')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!clinic) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('clinics').update({ name, address, phone, primary_color: color }).eq('id', clinic.id)
    setSession({ ...clinic, name, address, phone, color }, user!)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setSaving(false)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Configurações</h1>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Dados da Clínica</h2>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.field}>
            <label>Nome da Clínica</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Telefone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className={styles.field}>
            <label>Endereço</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Cor principal</label>
            <div className={styles.colorRow}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className={styles.colorPicker} />
              <input value={color} onChange={(e) => setColor(e.target.value)} className={styles.colorText} placeholder="#7C3AED" />
            </div>
          </div>
          <div className={styles.saveRow}>
            {saved && <span className={styles.savedMsg}>✓ Salvo!</span>}
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Informações da Conta</h2>
        <div className={styles.infoGrid}>
          <InfoRow label="Usuário" value={user?.displayName ?? '-'} />
          <InfoRow label="Função" value={user?.role ?? '-'} />
          <InfoRow label="Clínica ID" value={clinic?.id ?? '-'} mono />
          <InfoRow label="Plano" value="Básico" />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.mono : ''}`}>{value}</span>
    </div>
  )
}

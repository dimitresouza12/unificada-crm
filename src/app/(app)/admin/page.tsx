'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import type { Clinic, ClinicUser, AuditLog } from '@/types'
import styles from './admin.module.css'

type AdminTab = 'clinicas' | 'usuarios' | 'logs'

interface NewClinic { name: string; slug: string; clinic_type: string; email: string; phone: string; address: string }
const BLANK_CLINIC: NewClinic = { name: '', slug: '', clinic_type: 'odonto', email: '', phone: '', address: '' }

export default function AdminPage() {
  const { user, clinic: myClinic, setClinicLogo } = useAuthStore()
  const [tab, setTab] = useState<AdminTab>('clinicas')
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [users, setUsers] = useState<ClinicUser[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewClinic>(BLANK_CLINIC)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadMsg, setUploadMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingClinicRef = useRef<Clinic | null>(null)

  if (!user?.isSuperAdmin) {
    return <div className={styles.denied}>Acesso restrito a superadmins.</div>
  }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [clinicsRes, usersRes, logsRes] = await Promise.all([
      supabase.from('clinics').select('*').order('created_at', { ascending: false }),
      supabase.from('clinic_users').select('*, clinics(name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setClinics((clinicsRes.data ?? []) as Clinic[])
    setUsers((usersRes.data ?? []) as ClinicUser[])
    setLogs((logsRes.data ?? []) as AuditLog[])
    setLoading(false)
  }

  async function handleCreateClinic() {
    if (!form.name || !form.slug) return
    setSaving(true)
    await supabase.from('clinics').insert([form])
    setSaving(false)
    setShowModal(false)
    setForm(BLANK_CLINIC)
    loadAll()
  }

  async function toggleClinic(id: string, active: boolean) {
    await supabase.from('clinics').update({ is_active: !active }).eq('id', id)
    loadAll()
  }

  function triggerLogoUpload(clinic: Clinic) {
    pendingClinicRef.current = clinic
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const clinic = pendingClinicRef.current
    if (!file || !clinic) return
    e.target.value = ''

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${clinic.id}/logo.${ext}`

    setUploadingId(clinic.id)
    setUploadMsg(null)

    const { error: upErr } = await supabase.storage
      .from('clinic-logos')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      setUploadingId(null)
      setUploadMsg({ id: clinic.id, ok: false, text: 'Erro no upload: ' + upErr.message })
      return
    }

    const { data: urlData } = supabase.storage.from('clinic-logos').getPublicUrl(path)
    const publicUrl = urlData.publicUrl + '?t=' + Date.now()

    const { error: dbErr } = await supabase.from('clinics').update({ logo_url: publicUrl }).eq('id', clinic.id)
    setUploadingId(null)

    if (dbErr) {
      setUploadMsg({ id: clinic.id, ok: false, text: 'Erro ao salvar: ' + dbErr.message })
      return
    }

    setUploadMsg({ id: clinic.id, ok: true, text: 'Logo atualizada!' })
    if (myClinic?.id === clinic.id) setClinicLogo(publicUrl)
    loadAll()
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'clinicas', label: `Clínicas (${clinics.length})` },
    { key: 'usuarios', label: `Usuários (${users.length})` },
    { key: 'logs', label: 'Logs de Auditoria' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🛡️ Admin — SaaS</h1>
        {tab === 'clinicas' && (
          <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>+ Nova Clínica</button>
        )}
      </div>

      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Hidden file input shared across all rows */}
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: 'none' }} onChange={handleFileChange} />

      {loading ? <p className={styles.loading}>Carregando...</p> : (
        <>
          {tab === 'clinicas' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Logo</th><th>Nome</th><th>Slug</th><th>Tipo</th><th>Plano</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {clinics.length === 0 ? (
                    <tr><td colSpan={8} className={styles.empty}>Nenhuma clínica.</td></tr>
                  ) : clinics.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className={styles.logoCell}>
                          {c.logo_url
                            ? <img src={c.logo_url} alt={c.name} className={styles.logoThumb} />
                            : <div className={styles.logoPlaceholder}>?</div>
                          }
                        </div>
                      </td>
                      <td className={styles.bold}>{c.name}</td>
                      <td><code className={styles.code}>{c.slug}</code></td>
                      <td>{c.clinic_type}</td>
                      <td>{c.plan ?? '-'}</td>
                      <td><span className={`status-badge ${c.is_active ? 'status-concluido' : 'status-cancelado'}`}>{c.is_active ? 'Ativa' : 'Inativa'}</span></td>
                      <td>{formatDate(c.created_at, true)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.btnUploadLogo}
                            onClick={() => triggerLogoUpload(c)}
                            disabled={uploadingId === c.id}
                            title="Fazer upload da logo"
                          >
                            {uploadingId === c.id ? '...' : '↑ Logo'}
                          </button>
                          <button className={c.is_active ? styles.btnDeactivate : styles.btnActivate} onClick={() => toggleClinic(c.id, c.is_active)}>
                            {c.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                        {uploadMsg?.id === c.id && (
                          <p className={uploadMsg.ok ? styles.msgOk : styles.msgErr}>{uploadMsg.text}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'usuarios' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Usuário</th><th>Nome</th><th>Clínica</th><th>Função</th><th>Status</th><th>Cadastro</th></tr></thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={6} className={styles.empty}>Nenhum usuário.</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id}>
                      <td><code className={styles.code}>{u.username}</code></td>
                      <td className={styles.bold}>{u.display_name}</td>
                      <td>{(u as ClinicUser & { clinics?: { name: string } }).clinics?.name ?? '-'}</td>
                      <td>{u.role}{u.is_superadmin ? ' 🛡️' : ''}</td>
                      <td><span className={`status-badge ${u.is_active ? 'status-concluido' : 'status-cancelado'}`}>{u.is_active ? 'Ativo' : 'Inativo'}</span></td>
                      <td>{formatDate(u.created_at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'logs' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Data</th><th>Módulo</th><th>Ação</th><th>IP</th></tr></thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={4} className={styles.empty}>Nenhum log.</td></tr>
                  ) : logs.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDate(l.created_at)}</td>
                      <td>{l.module}</td>
                      <td>{l.action}</td>
                      <td>{l.ip_address ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Nova Clínica</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {([
                ['name','Nome *','text'],['slug','Slug *','text'],
                ['email','E-mail','email'],['phone','Telefone','tel'],['address','Endereço','text'],
              ] as [keyof NewClinic, string, string][]).map(([k,l,t]) => (
                <div className={styles.field} key={k}>
                  <label>{l}</label>
                  <input type={t} value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
              <div className={styles.field}>
                <label>Tipo</label>
                <select value={form.clinic_type} onChange={(e) => setForm((p) => ({ ...p, clinic_type: e.target.value }))}>
                  <option value="odonto">Odontologia</option>
                  <option value="medico">Medicina</option>
                  <option value="estetica">Estética</option>
                  <option value="vet">Veterinária</option>
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleCreateClinic} disabled={saving || !form.name || !form.slug}>
                {saving ? 'Criando...' : 'Criar Clínica'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { createN8nClient } from '@/lib/supabase-n8n'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import { formatDate } from '@/lib/utils'
import styles from './crm.module.css'

interface Lead {
  phone: string
  conversation_id: string
  nome: string | null
  procedimento: string | null
  status: string | null
  data_agendamento: string | null
  created_at: string | null
  ai_service: string | null
  contexto: string | null
}

interface ChatMessage {
  id: number
  created_at: string | null
  phone: string | null
  bot_message: string | null
  user_message: string | null
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'novo',      label: 'Novo Lead',   color: '#6B7280' },
  { key: 'Agendado',  label: 'Agendado',    color: '#0EA5E9' },
  { key: 'Concluído', label: 'Concluído',   color: '#10B981' },
]

function colKey(status: string | null) {
  if (!status) return 'novo'
  return status
}

function initials(name: string | null, phone: string) {
  if (name?.trim()) return name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return phone.slice(-2)
}

function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  return phone
}

export default function CRMPage() {
  const { clinic } = useAuthStore()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertMsg, setConvertMsg] = useState('')
  const [existingPatients, setExistingPatients] = useState<Set<string>>(new Set())

  useEffect(() => { loadLeads() }, [])
  useEffect(() => { if (clinic) loadExistingPatients() }, [clinic])

  async function loadLeads() {
    setLoading(true)
    const n8n = createN8nClient()
    const { data } = await n8n
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as Lead[]
    // filter out invalid entries (phone = "=")
    setLeads(rows.filter(r => r.phone && r.phone !== '=' && r.phone.length > 5))
    setLoading(false)
  }

  async function loadExistingPatients() {
    if (!clinic) return
    const { data } = await supabase.from('patients').select('phone').eq('clinic_id', clinic.id)
    const phones = new Set((data ?? []).map(p => String(p.phone ?? '').replace(/\D/g, '')))
    setExistingPatients(phones)
  }

  async function openLead(lead: Lead) {
    setSelected(lead)
    setConvertMsg('')
    setMsgLoading(true)
    const n8n = createN8nClient()
    const clean = lead.phone.replace(/\D/g, '')
    const { data } = await n8n
      .from('chat_messages')
      .select('*')
      .or(`phone.eq.${clean},phone.eq.55${clean},phone.eq.${lead.phone}`)
      .order('created_at', { ascending: true })
      .limit(80)
    setMessages((data ?? []) as ChatMessage[])
    setMsgLoading(false)
  }

  async function convertToPatient() {
    if (!selected || !clinic) return
    setConverting(true)
    setConvertMsg('')
    const clean = selected.phone.replace(/\D/g, '')

    // Check duplicate
    if (existingPatients.has(clean)) {
      setConvertMsg('already')
      setConverting(false)
      return
    }

    const { error } = await supabase.from('patients').insert([{
      clinic_id: clinic.id,
      name: selected.nome?.trim() || `Lead ${selected.phone}`,
      phone: selected.phone,
      is_active: true,
      registration_status: 'approved',
      notes: selected.procedimento ? `Procedimento de interesse: ${selected.procedimento}` : null,
    }])

    if (error) {
      setConvertMsg('error')
    } else {
      setConvertMsg('ok')
      setExistingPatients(prev => new Set([...prev, clean]))
      loadLeads()
    }
    setConverting(false)
  }

  const byCol = (col: string) => leads.filter(l => colKey(l.status) === col)

  const stats = {
    total: leads.length,
    agendados: leads.filter(l => l.status === 'Agendado').length,
    concluidos: leads.filter(l => l.status === 'Concluído').length,
    semNome: leads.filter(l => !l.nome).length,
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>CRM — Leads WhatsApp</h1>
          <p className={styles.sub}>Contatos captados pelo bot de IA</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadLeads}>↻ Atualizar</button>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}><span className={styles.statVal}>{stats.total}</span><span className={styles.statLabel}>Total de leads</span></div>
        <div className={styles.stat}><span className={styles.statVal} style={{ color: '#0EA5E9' }}>{stats.agendados}</span><span className={styles.statLabel}>Agendados</span></div>
        <div className={styles.stat}><span className={styles.statVal} style={{ color: '#10B981' }}>{stats.concluidos}</span><span className={styles.statLabel}>Concluídos</span></div>
        <div className={styles.stat}><span className={styles.statVal} style={{ color: '#F59E0B' }}>{stats.semNome}</span><span className={styles.statLabel}>Sem identificação</span></div>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando leads...</p>
      ) : (
        <div className={styles.kanban}>
          {COLUMNS.map(col => {
            const cards = byCol(col.key)
            return (
              <div key={col.key} className={styles.column}>
                <div className={styles.colHeader}>
                  <span className={styles.colDot} style={{ background: col.color }} />
                  <span className={styles.colLabel}>{col.label}</span>
                  <span className={styles.colCount}>{cards.length}</span>
                </div>
                <div className={styles.cards}>
                  {cards.length === 0 && <p className={styles.empty}>Nenhum lead</p>}
                  {cards.map(lead => {
                    const clean = lead.phone.replace(/\D/g, '')
                    const isPatient = existingPatients.has(clean)
                    return (
                      <div key={`${lead.phone}-${lead.conversation_id}`} className={styles.card} onClick={() => openLead(lead)}>
                        <div className={styles.cardTop}>
                          <div className={styles.avatar}>{initials(lead.nome, lead.phone)}</div>
                          <div className={styles.cardInfo}>
                            <span className={styles.cardName}>{lead.nome || <em className={styles.noName}>Sem nome</em>}</span>
                            <span className={styles.cardPhone}>{fmtPhone(lead.phone)}</span>
                          </div>
                          {isPatient && <span className={styles.badgePatient}>Paciente</span>}
                        </div>
                        {lead.procedimento && (
                          <span className={styles.badgeProcedimento}>{lead.procedimento}</span>
                        )}
                        {lead.data_agendamento && (
                          <span className={styles.cardDate}>📅 {formatDate(lead.data_agendamento, true)}</span>
                        )}
                        {lead.created_at && (
                          <span className={styles.cardCreated}>{formatDate(lead.created_at, true)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <Portal>
          <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelAvatarWrap}>
                  <div className={styles.panelAvatar}>{initials(selected.nome, selected.phone)}</div>
                  <div>
                    <h2 className={styles.panelName}>{selected.nome || 'Sem nome'}</h2>
                    <p className={styles.panelPhone}>{fmtPhone(selected.phone)}</p>
                  </div>
                </div>
                <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
              </div>

              <div className={styles.panelMeta}>
                {selected.procedimento && <MetaRow label="Procedimento" value={selected.procedimento} />}
                {selected.status && <MetaRow label="Status" value={selected.status} />}
                {selected.data_agendamento && <MetaRow label="Agendamento" value={formatDate(selected.data_agendamento, true)} />}
                {selected.ai_service && <MetaRow label="Serviço IA" value={selected.ai_service} />}
                {selected.created_at && <MetaRow label="Primeiro contato" value={formatDate(selected.created_at, true)} />}
              </div>

              {/* Conversation */}
              <div className={styles.chatSection}>
                <p className={styles.chatTitle}>Histórico WhatsApp</p>
                <div className={styles.chatBox}>
                  {msgLoading && <p className={styles.chatInfo}>Carregando...</p>}
                  {!msgLoading && messages.length === 0 && <p className={styles.chatInfo}>Nenhuma mensagem encontrada.</p>}
                  {messages.map(m => {
                    const msgs = []
                    if (m.user_message) msgs.push(
                      <div key={`u-${m.id}`} className={`${styles.bubble} ${styles.user}`}>
                        <span>{m.user_message}</span>
                        <span className={styles.bubbleTime}>{m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    )
                    if (m.bot_message) msgs.push(
                      <div key={`b-${m.id}`} className={`${styles.bubble} ${styles.bot}`}>
                        <span>{m.bot_message}</span>
                        <span className={styles.bubbleTime}>{m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    )
                    return msgs
                  })}
                </div>
              </div>

              {/* Convert action */}
              <div className={styles.panelFooter}>
                {convertMsg === 'ok' && <p className={styles.msgOk}>✓ Paciente criado com sucesso!</p>}
                {convertMsg === 'already' && <p className={styles.msgWarn}>Telefone já cadastrado como paciente.</p>}
                {convertMsg === 'error' && <p className={styles.msgErr}>Erro ao criar paciente.</p>}
                {existingPatients.has(selected.phone.replace(/\D/g, '')) ? (
                  <button className={styles.btnPatientExists} disabled>✓ Já é paciente</button>
                ) : (
                  <button className={styles.btnConvert} onClick={convertToPatient} disabled={converting}>
                    {converting ? 'Convertendo...' : '+ Converter em Paciente'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{value}</span>
    </div>
  )
}

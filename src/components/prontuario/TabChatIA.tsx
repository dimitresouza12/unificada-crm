'use client'
import { useState, useEffect, useRef } from 'react'
import { n8nClient } from '@/lib/supabase-n8n'
import styles from './TabChatIA.module.css'

interface Message {
  id: string
  text: string
  sender: 'user' | 'bot'
  time: string
}

export function TabChatIA({ phone }: { phone: string | null }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
  }, [phone])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    setLoading(true)
    setError('')
    if (!phone) {
      setError('Paciente sem número de telefone cadastrado.')
      setLoading(false)
      return
    }

    const phoneClean = String(phone).replace(/\D/g, '')
    try {
      // Try chat_messages first
      const { data: msgData, error: msgErr } = await n8nClient
        .from('chat_messages')
        .select('*')
        .or(`phone.eq.${phoneClean},phone.eq.55${phoneClean}`)
        .order('created_at', { ascending: true })
        .limit(100)

      if (!msgErr && msgData && msgData.length > 0) {
        const msgs: Message[] = []
        msgData.forEach((row: Record<string, unknown>) => {
          const time = row.created_at ? new Date(row.created_at as string).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
          if (row.user_message) msgs.push({ id: `u-${row.id}`, text: String(row.user_message), sender: 'user', time })
          if (row.bot_message) msgs.push({ id: `b-${row.id}`, text: String(row.bot_message), sender: 'bot', time })
        })
        setMessages(msgs)
        setLoading(false)
        return
      }

      // Fallback: n8n_chat_histories
      const { data: histData, error: histErr } = await n8nClient
        .from('n8n_chat_histories')
        .select('*')
        .or(`session_id.eq.${phoneClean},session_id.eq.55${phoneClean}`)
        .order('id', { ascending: true })
        .limit(100)

      if (histErr) throw histErr

      const msgs: Message[] = (histData ?? []).map((row: Record<string, unknown>) => {
        const msg = row.message as { type?: string; data?: { content?: string } }
        const text = msg?.data?.content ?? '...'
        const sender: 'user' | 'bot' = msg?.type === 'human' ? 'user' : 'bot'
        return { id: String(row.id), text, sender, time: '' }
      })
      setMessages(msgs)
    } catch {
      setError('Não foi possível carregar o histórico de conversas do WhatsApp.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.badge}>WhatsApp / IA</span>
        <span className={styles.readOnly}>somente leitura</span>
      </div>

      <div className={styles.chatBox}>
        {loading && <p className={styles.info}>Carregando histórico...</p>}
        {error && <p className={styles.info}>{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className={styles.info}>Nenhuma conversa encontrada para este paciente.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.bubble} ${styles[msg.sender]}`}>
            <span className={styles.text}>{msg.text}</span>
            {msg.time && <span className={styles.time}>{msg.time}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

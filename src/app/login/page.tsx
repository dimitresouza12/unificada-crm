'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Clinic, ClinicUser, AuthClinic, AuthUser } from '@/types'
import styles from './login.module.css'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

type Mode = 'login' | 'register'

const CLINIC_TYPES = [
  { value: 'odonto',   label: 'Odontologia',  emoji: '🦷' },
  { value: 'medico',   label: 'Medicina',     emoji: '🩺' },
  { value: 'estetica', label: 'Estética',     emoji: '✨' },
  { value: 'vet',      label: 'Veterinária',  emoji: '🐾' },
] as const

type ClinicTypeValue = typeof CLINIC_TYPES[number]['value']

interface RegisterForm {
  name: string; phone: string; email: string; password: string; cpf: string; clinic_id: string; clinic_type: ClinicTypeValue | ''
}

export default function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession)
  const [mode, setMode] = useState<Mode>('login')

  // Login state
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const [loading, setLoading] = useState(false)

  // Register state
  const [reg, setReg] = useState<RegisterForm>({ name: '', phone: '', email: '', password: '', cpf: '', clinic_id: '', clinic_type: '' })
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([])
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [regLoading, setRegLoading] = useState(false)

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.error}>
            ⚠️ Variáveis de ambiente não configuradas.<br />
            NEXT_PUBLIC_SUPABASE_URL: {SUPABASE_URL ? '✓' : '✗'}<br />
            NEXT_PUBLIC_SUPABASE_ANON_KEY: {SUPABASE_KEY ? '✓' : '✗'}
          </p>
        </div>
      </div>
    )
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStep('')
    setLoading(true)

    try {
      let email = credential.trim()
      console.log('[login] iniciando:', email.includes('@') ? 'email' : 'username')

      if (!email.includes('@')) {
        setStep('Buscando usuário...')
        const { data: userData, error: lookupErr } = await supabase
          .from('clinic_users').select('email')
          .eq('username', email.toLowerCase()).eq('is_active', true).maybeSingle()
        console.log('[login] lookup:', { userData, lookupErr })
        if (lookupErr) throw new Error('Erro de banco: ' + lookupErr.message)
        if (!userData?.email) throw new Error('Usuário "' + email + '" não encontrado.')
        email = userData.email
      }

      setStep('Verificando senha...')
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      console.log('[login] auth:', { user: authData?.user?.id, authErr })
      if (authErr) throw new Error(authErr.message)

      setStep('Carregando clínica...')
      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users').select('*, clinics(*)')
        .eq('user_id', authData.user.id).eq('is_active', true)
        .maybeSingle<ClinicUser & { clinics: Clinic }>()
      console.log('[login] clinicUser:', { clinicUser, cuErr })
      if (cuErr) throw new Error('Erro RLS: ' + cuErr.message)
      if (!clinicUser) throw new Error('Usuário sem clínica associada. (user_id: ' + authData.user.id + ')')
      if (!clinicUser.clinics) throw new Error('Dados da clínica não encontrados.')

      const clinic: AuthClinic = {
        id: clinicUser.clinic_id, name: clinicUser.clinics.name,
        type: clinicUser.clinics.clinic_type, logo: clinicUser.clinics.logo_url ?? '',
        address: clinicUser.clinics.address ?? '', phone: clinicUser.clinics.phone ?? '',
        color: clinicUser.clinics.primary_color ?? '#7C3AED', slug: clinicUser.clinics.slug,
      }
      const user: AuthUser = {
        id: clinicUser.user_id, role: clinicUser.role,
        displayName: clinicUser.display_name, isSuperAdmin: clinicUser.is_superadmin,
      }

      setStep('Abrindo painel...')
      setSession(clinic, user)
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[login] erro:', msg)
      setError(msg === 'Invalid login credentials' ? 'Usuário ou senha incorretos.' : msg)
      setStep('')
      setLoading(false)
    }
  }

  async function loadClinics(type?: ClinicTypeValue) {
    let q = supabase.from('clinics').select('id, name').eq('is_active', true).order('name')
    if (type) q = q.eq('clinic_type', type)
    const { data } = await q
    if (data) {
      setClinics(data)
      setReg(p => ({ ...p, clinic_id: data.length === 1 ? data[0].id : '' }))
    }
  }

  function switchToRegister() {
    setMode('register')
    setRegError('')
    setRegSuccess(false)
    setClinics([])
  }

  function selectClinicType(type: ClinicTypeValue) {
    setReg(p => ({ ...p, clinic_type: type, clinic_id: '' }))
    loadClinics(type)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')
    if (!reg.name.trim()) return setRegError('Nome é obrigatório.')
    if (!reg.email.trim()) return setRegError('E-mail é obrigatório.')
    if (!reg.password || reg.password.length < 6) return setRegError('Senha deve ter pelo menos 6 caracteres.')
    if (!reg.clinic_type) return setRegError('Selecione o tipo de clínica.')
    if (!reg.clinic_id) return setRegError('Selecione uma clínica.')
    setRegLoading(true)

    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: reg.email.trim(),
        password: reg.password,
        options: { data: { display_name: reg.name.trim() } },
      })
      if (authErr) throw new Error(authErr.message)

      // 2. Create pending patient record
      const { error: patErr } = await supabase.from('patients').insert([{
        clinic_id: reg.clinic_id,
        name: reg.name.trim(),
        email: reg.email.trim(),
        phone: reg.phone.trim() || null,
        cpf: reg.cpf.trim() || null,
        is_active: false,
        self_registered: true,
        registration_status: 'pending',
      }])

      if (patErr) {
        console.error('[register] patient insert error:', patErr)
        // Auth user was created; just warn but don't block
      }

      // Sign out the newly created user — they need admin approval first
      await supabase.auth.signOut()
      setRegSuccess(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setRegError(msg === 'User already registered' ? 'Este e-mail já está cadastrado.' : msg)
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandName}>My<strong>Clinica</strong></span>
          <p className={styles.brandSub}>Gestão clínica inteligente</p>
        </div>

        {/* Tab switch */}
        <div className={styles.modeTabs}>
          <button className={`${styles.modeTab} ${mode === 'login' ? styles.modeTabActive : ''}`} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={`${styles.modeTab} ${mode === 'register' ? styles.modeTabActive : ''}`} onClick={switchToRegister}>
            Cadastrar
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="credential">Usuário ou E-mail</label>
              <input id="credential" type="text" value={credential}
                onChange={e => setCredential(e.target.value)}
                placeholder="usuario ou email@clinica.com" required autoComplete="username" />
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {step && <p className={styles.step}>{step}</p>}
            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? (step || 'Autenticando...') : 'Entrar'}
            </button>
          </form>
        ) : regSuccess ? (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h3 className={styles.successTitle}>Cadastro enviado!</h3>
            <p className={styles.successMsg}>
              Seu cadastro foi recebido e está aguardando aprovação da clínica.<br />
              Você receberá um contato assim que for aprovado.
            </p>
            <button className={styles.btnOutline} onClick={() => { setMode('login'); setRegSuccess(false) }}>
              Voltar ao login
            </button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className={styles.form}>
            <div className={styles.field}>
              <label>Tipo de clínica *</label>
              <div className={styles.typeGrid}>
                {CLINIC_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.typeCard} ${reg.clinic_type === t.value ? styles.typeCardActive : ''}`}
                    onClick={() => selectClinicType(t.value)}
                  >
                    <span className={styles.typeEmoji}>{t.emoji}</span>
                    <span className={styles.typeLabel}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {reg.clinic_type && clinics.length > 1 && (
              <div className={styles.field}>
                <label>Clínica</label>
                <select value={reg.clinic_id} onChange={e => setReg(p => ({ ...p, clinic_id: e.target.value }))} required>
                  <option value="">Selecione a clínica</option>
                  {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {reg.clinic_type && clinics.length === 0 && (
              <p className={styles.regNote}>Nenhuma clínica cadastrada para este tipo.</p>
            )}
            <div className={styles.field}>
              <label>Nome completo *</label>
              <input type="text" value={reg.name} onChange={e => setReg(p => ({ ...p, name: e.target.value }))} placeholder="Seu nome" required />
            </div>
            <div className={styles.field}>
              <label>Telefone / WhatsApp</label>
              <input type="tel" value={reg.phone} onChange={e => setReg(p => ({ ...p, phone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className={styles.field}>
              <label>CPF</label>
              <input type="text" value={reg.cpf} onChange={e => setReg(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" />
            </div>
            <div className={styles.field}>
              <label>E-mail *</label>
              <input type="email" value={reg.email} onChange={e => setReg(p => ({ ...p, email: e.target.value }))} placeholder="seu@email.com" required />
            </div>
            <div className={styles.field}>
              <label>Senha *</label>
              <input type="password" value={reg.password} onChange={e => setReg(p => ({ ...p, password: e.target.value }))} placeholder="mín. 6 caracteres" required />
            </div>
            {regError && <p className={styles.error}>{regError}</p>}
            <p className={styles.regNote}>Após o cadastro, sua conta ficará pendente de aprovação da clínica.</p>
            <button type="submit" className={styles.btn} disabled={regLoading}>
              {regLoading ? 'Enviando cadastro...' : 'Solicitar Cadastro'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

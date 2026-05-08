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
  { value: 'odonto',   label: 'Odontologia', emoji: '🦷' },
  { value: 'medico',   label: 'Medicina',    emoji: '🩺' },
  { value: 'estetica', label: 'Estética',    emoji: '✨' },
  { value: 'vet',      label: 'Veterinária', emoji: '🐾' },
] as const

type ClinicTypeValue = typeof CLINIC_TYPES[number]['value']

interface RegisterForm {
  clinic_type: ClinicTypeValue | ''
  clinic_name: string
  admin_name: string
  email: string
  password: string
  phone: string
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
  const BLANK_REG: RegisterForm = { clinic_type: '', clinic_name: '', admin_name: '', email: '', password: '', phone: '' }
  const [reg, setReg] = useState<RegisterForm>(BLANK_REG)
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

      if (!email.includes('@')) {
        setStep('Buscando usuário...')
        const { data: userData, error: lookupErr } = await supabase
          .from('clinic_users').select('email')
          .eq('username', email.toLowerCase()).eq('is_active', true).maybeSingle()
        if (lookupErr) throw new Error('Erro de banco: ' + lookupErr.message)
        if (!userData?.email) throw new Error('Usuário "' + email + '" não encontrado.')
        email = userData.email
      }

      setStep('Verificando senha...')
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) throw new Error(authErr.message)

      setStep('Carregando clínica...')
      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users').select('*, clinics(*)')
        .eq('user_id', authData.user.id).eq('is_active', true)
        .maybeSingle<ClinicUser & { clinics: Clinic }>()
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
      setError(msg === 'Invalid login credentials' ? 'Usuário ou senha incorretos.' : msg)
      setStep('')
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')

    if (!reg.clinic_type)   return setRegError('Selecione o tipo de clínica.')
    if (!reg.clinic_name.trim()) return setRegError('Nome da clínica é obrigatório.')
    if (!reg.admin_name.trim())  return setRegError('Seu nome é obrigatório.')
    if (!reg.email.trim())       return setRegError('E-mail é obrigatório.')
    if (reg.password.length < 6) return setRegError('Senha deve ter pelo menos 6 caracteres.')

    setRegLoading(true)
    try {
      const slug = toSlug(reg.clinic_name)

      // 1. Check slug uniqueness
      const { data: existing } = await supabase.from('clinics').select('id').eq('slug', slug).maybeSingle()
      if (existing) return setRegError('Já existe uma clínica com esse nome. Tente um nome diferente.')

      // 2. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: reg.email.trim(),
        password: reg.password,
        options: { data: { display_name: reg.admin_name.trim() } },
      })
      if (authErr) throw new Error(authErr.message)
      if (!authData.user) throw new Error('Falha ao criar usuário.')

      // 3. Create clinic
      const { data: clinic, error: clinicErr } = await supabase
        .from('clinics')
        .insert([{
          name: reg.clinic_name.trim(),
          slug,
          clinic_type: reg.clinic_type,
          phone: reg.phone.trim() || null,
          is_active: true,
          plan: 'trial',
        }])
        .select()
        .single<Clinic>()
      if (clinicErr) throw new Error('Erro ao criar clínica: ' + clinicErr.message)

      // 4. Create clinic_user (admin)
      const { error: cuErr } = await supabase.from('clinic_users').insert([{
        clinic_id: clinic.id,
        user_id: authData.user.id,
        role: 'admin',
        display_name: reg.admin_name.trim(),
        username: slug,
        is_active: true,
        is_superadmin: false,
        email: reg.email.trim(),
      }])
      if (cuErr) throw new Error('Erro ao vincular usuário: ' + cuErr.message)

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

        <div className={styles.modeTabs}>
          <button className={`${styles.modeTab} ${mode === 'login' ? styles.modeTabActive : ''}`} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={`${styles.modeTab} ${mode === 'register' ? styles.modeTabActive : ''}`} onClick={() => { setMode('register'); setRegError(''); setRegSuccess(false) }}>
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
            <h3 className={styles.successTitle}>Clínica criada!</h3>
            <p className={styles.successMsg}>
              Sua clínica foi cadastrada com sucesso.<br />
              Faça login para acessar o painel.
            </p>
            <button className={styles.btnOutline} onClick={() => { setMode('login'); setRegSuccess(false); setReg(BLANK_REG) }}>
              Fazer login
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
                    onClick={() => setReg(p => ({ ...p, clinic_type: t.value }))}
                  >
                    <span className={styles.typeEmoji}>{t.emoji}</span>
                    <span className={styles.typeLabel}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label>Nome da clínica *</label>
              <input
                type="text"
                value={reg.clinic_name}
                onChange={e => setReg(p => ({ ...p, clinic_name: e.target.value }))}
                placeholder="Ex: Clínica Sorriso"
                required
              />
              {reg.clinic_name && (
                <span className={styles.slugHint}>myclinica.app/{toSlug(reg.clinic_name)}</span>
              )}
            </div>

            <div className={styles.field}>
              <label>Seu nome (responsável) *</label>
              <input
                type="text"
                value={reg.admin_name}
                onChange={e => setReg(p => ({ ...p, admin_name: e.target.value }))}
                placeholder="Dr. João Silva"
                required
              />
            </div>

            <div className={styles.field}>
              <label>E-mail *</label>
              <input
                type="email"
                value={reg.email}
                onChange={e => setReg(p => ({ ...p, email: e.target.value }))}
                placeholder="contato@clinica.com"
                required
              />
            </div>

            <div className={styles.field}>
              <label>Senha *</label>
              <input
                type="password"
                value={reg.password}
                onChange={e => setReg(p => ({ ...p, password: e.target.value }))}
                placeholder="mín. 6 caracteres"
                required
              />
            </div>

            <div className={styles.field}>
              <label>Telefone</label>
              <input
                type="tel"
                value={reg.phone}
                onChange={e => setReg(p => ({ ...p, phone: e.target.value }))}
                placeholder="(00) 00000-0000"
              />
            </div>

            {regError && <p className={styles.error}>{regError}</p>}
            <p className={styles.regNote}>Ao criar sua conta você concorda com os termos de uso. Plano trial gratuito por 14 dias.</p>
            <button type="submit" className={styles.btn} disabled={regLoading}>
              {regLoading ? 'Criando clínica...' : 'Criar minha clínica'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

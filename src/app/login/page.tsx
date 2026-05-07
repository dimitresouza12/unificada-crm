'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Clinic, ClinicUser, AuthClinic, AuthUser } from '@/types'
import styles from './login.module.css'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession)
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const [loading, setLoading] = useState(false)

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.error}>
            ⚠️ Variáveis de ambiente não configuradas.<br />
            NEXT_PUBLIC_SUPABASE_URL: {SUPABASE_URL ? '✓' : '✗ ausente'}<br />
            NEXT_PUBLIC_SUPABASE_ANON_KEY: {SUPABASE_KEY ? '✓' : '✗ ausente'}
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStep('')
    setLoading(true)

    try {
      let email = credential.trim()
      console.log('[login] iniciando, credencial:', email.includes('@') ? 'email' : 'username')

      if (!email.includes('@')) {
        setStep('Buscando usuário...')
        console.log('[login] buscando username:', email.toLowerCase())
        const { data: userData, error: lookupErr } = await supabase
          .from('clinic_users')
          .select('email')
          .eq('username', email.toLowerCase())
          .eq('is_active', true)
          .maybeSingle()

        console.log('[login] lookup resultado:', { userData, lookupErr })
        if (lookupErr) throw new Error('Erro de banco: ' + lookupErr.message)
        if (!userData?.email) throw new Error('Usuário "' + email + '" não encontrado.')
        email = userData.email
      }

      setStep('Verificando senha...')
      console.log('[login] autenticando email:', email)
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      console.log('[login] auth resultado:', { user: authData?.user?.id, authErr })
      if (authErr) throw new Error(authErr.message)

      setStep('Carregando clínica...')
      console.log('[login] buscando clinic_user para:', authData.user.id)
      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users')
        .select('*, clinics(*)')
        .eq('user_id', authData.user.id)
        .eq('is_active', true)
        .maybeSingle<ClinicUser & { clinics: Clinic }>()

      console.log('[login] clinicUser resultado:', { clinicUser, cuErr })
      if (cuErr) throw new Error('Erro RLS: ' + cuErr.message)
      if (!clinicUser) throw new Error('Usuário sem clínica associada. (user_id: ' + authData.user.id + ')')
      if (!clinicUser.clinics) throw new Error('Dados da clínica não encontrados. (clinic_id: ' + clinicUser.clinic_id + ')')

      const clinic: AuthClinic = {
        id: clinicUser.clinic_id,
        name: clinicUser.clinics.name,
        type: clinicUser.clinics.clinic_type,
        logo: clinicUser.clinics.logo_url ?? '',
        address: clinicUser.clinics.address ?? '',
        phone: clinicUser.clinics.phone ?? '',
        color: clinicUser.clinics.primary_color ?? '#7C3AED',
        slug: clinicUser.clinics.slug,
      }
      const user: AuthUser = {
        id: clinicUser.user_id,
        role: clinicUser.role,
        displayName: clinicUser.display_name,
        isSuperAdmin: clinicUser.is_superadmin,
      }

      console.log('[login] sessão definida, redirecionando...')
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandName}>My<strong>Clinica</strong></span>
          <p className={styles.brandSub}>Gestão clínica inteligente</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="credential">Usuário ou E-mail</label>
            <input
              id="credential"
              type="text"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="usuario ou email@clinica.com"
              required
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {step && <p className={styles.step}>{step}</p>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? (step || 'Autenticando...') : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

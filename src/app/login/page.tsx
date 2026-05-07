'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Clinic, ClinicUser, AuthClinic, AuthUser } from '@/types'
import styles from './login.module.css'

export default function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession)
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStep('')
    setLoading(true)

    const supabase = createClient()

    try {
      let email = credential.trim()

      if (!email.includes('@')) {
        setStep('Buscando usuário...')
        const { data: userData, error: lookupErr } = await supabase
          .from('clinic_users')
          .select('email')
          .eq('username', email.toLowerCase())
          .eq('is_active', true)
          .single()

        if (lookupErr || !userData?.email) {
          throw new Error('Usuário não encontrado. Verifique o nome de usuário.')
        }
        email = userData.email
      }

      setStep('Verificando senha...')
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) throw authErr

      setStep('Carregando clínica...')
      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users')
        .select('*, clinics(*)')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
        .single<ClinicUser & { clinics: Clinic }>()

      if (cuErr) throw new Error('Erro ao carregar clínica: ' + cuErr.message)
      if (!clinicUser?.clinics) throw new Error('Clínica não encontrada. Contate o administrador.')

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

      setStep('Abrindo painel...')
      setSession(clinic, user)
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg === 'Invalid login credentials' ? 'Usuário ou senha incorretos.' : msg)
      setStep('')
    } finally {
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
          {step && !error && <p className={styles.step}>{step}</p>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? step || 'Autenticando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

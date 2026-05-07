'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Clinic, ClinicUser, AuthClinic, AuthUser } from '@/types'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()

    try {
      let email = credential.trim()

      if (!email.includes('@')) {
        const { data: userData, error: lookupErr } = await supabase
          .from('clinic_users')
          .select('email')
          .eq('username', email.toLowerCase())
          .eq('is_active', true)
          .single()

        if (lookupErr || !userData?.email) {
          throw new Error('Usuário não encontrado ou sem email vinculado.')
        }
        email = userData.email
      }

      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) throw authErr

      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users')
        .select('*, clinics(*)')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
        .single<ClinicUser & { clinics: Clinic }>()

      if (cuErr || !clinicUser?.clinics) throw new Error('Clínica não encontrada para este usuário.')

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

      setSession(clinic, user)
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao autenticar.'
      setError(
        msg === 'Invalid login credentials'
          ? 'Usuário ou senha incorretos.'
          : msg
      )
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

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { getSupabase } from '../../lib/supabase'

export function AdminLogin() {
  const { configured, user, signIn } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  if (user) return <Navigate to="/admin" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await signIn(email.trim(), password)
      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      })
      if (error) {
        await getSupabase().auth.signOut()
        throw error
      }
      push('Password verified. A 6-digit email code has been sent.', 'success')
      navigate('/admin-email-otp', { replace: true })
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'Administrator sign-in failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-screen admin-screen--center">
      <section className="admin-login">
        <div className="admin-brand admin-brand--dark">
          <span className="admin-brand-mark">M</span>
          <span>JTBazar<small>ADMIN STUDIO</small></span>
        </div>
        <p className="admin-kicker">Authorized access only</p>
        <h1>Sign in to JTBazar Admin</h1>
        {!configured ? (
          <p>Configure the Supabase project credentials in <code>.env.local</code> before signing in.</p>
        ) : (
          <form className="admin-form" onSubmit={(event) => void submit(event)}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="admin-button" disabled={saving}>
              {saving ? 'Verifying password…' : 'Continue with email verification'}
            </button>
          </form>
        )}
        <p className="admin-login-note">
          Administrator access requires your password, a 6-digit email verification code, and an authenticator code.
        </p>
      </section>
    </main>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import { getSupabase } from '../../lib/supabase'

function readAuthMethods(token: string): string[] {
  try {
    const part = token.split('.')[1]
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))) as { amr?: Array<{ method?: string }> }
    return Array.isArray(payload.amr) ? payload.amr.map((item) => item.method ?? '') : []
  } catch { return [] }
}

export function AdminEmailOtp() {
  const navigate = useNavigate()
  const { push } = useToast()
  const { user, isAdmin, loading } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(true)

  const email = user?.email ?? ''

  useEffect(() => {
    let active = true
    void getSupabase().auth.getSession().then(({ data, error }) => {
      if (!active) return
      const methods = !error && data.session ? readAuthMethods(data.session.access_token) : []
      if (methods.includes('otp')) {
        setVerified(true)
        navigate('/admin-mfa', { replace: true })
      }
      if (!methods.includes('password') && !methods.includes('otp')) navigate('/login', { replace: true })
      setChecking(false)
    })
    return () => { active = false }
  }, [navigate])

  if (loading || checking) return <main className="admin-screen admin-screen--center">Checking administrator access…</main>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <main className="admin-screen admin-screen--center"><h1>Access denied</h1><p>This account is not an authorized JTBazar administrator.</p></main>
  if (!email) return <Navigate to="/login" replace />
  if (verified) return <Navigate to="/admin-mfa" replace />

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw error
      const { data: sessionData, error: sessionError } = await getSupabase().auth.getSession()
      if (sessionError) throw sessionError
      const methods = sessionData.session ? readAuthMethods(sessionData.session.access_token) : []
      if (!methods.includes('otp')) {
        await getSupabase().auth.signOut()
        throw new Error('Email verification did not preserve the password login. Please sign in again.')
      }
      push('Email OTP verified. Now verify your authenticator.', 'success')
      navigate('/admin-mfa', { replace: true })
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'Email OTP verification failed.', 'error')
    } finally { setBusy(false) }
  }

  return <main className="admin-screen admin-screen--center"><section className="admin-login">
    <div className="admin-brand admin-brand--dark"><span className="admin-brand-mark">M</span><span>JTBazar<small>ADMIN STUDIO</small></span></div>
    <p className="admin-kicker">Security step 2 of 3</p><h1>Verify your email</h1>
    <p>Enter the six-digit code sent to <strong>{email}</strong>. Your password has already been verified.</p>
    <form className="admin-form" onSubmit={(event) => void verify(event)}>
      <label>Email verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required /></label>
      <button className="admin-button" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify email and continue'}</button>
    </form>
    <button className="admin-button admin-button--outline" onClick={async () => { await getSupabase().auth.signOut(); navigate('/login', { replace: true }) }}>Cancel and sign out</button>
  </section></main>
}

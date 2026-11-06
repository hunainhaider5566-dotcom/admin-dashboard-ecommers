import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { getSupabase } from '../../lib/supabase'

export function AdminLogin() {
  const { configured, user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  if (user) return <Navigate to="/admin" replace />

  async function sendCode() {
    if (!email.trim()) throw new Error('Enter your administrator email address.')
    const result = await getSupabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
    if (result.error) throw result.error
    setOtpSent(true)
    setCode('')
    setResendCooldown(60)
    push('If this email belongs to an administrator account, a 6-digit sign-in code has been sent.', 'success')
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true)
    try { await signIn(email, password); const { error } = await getSupabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); if (error) throw error; navigate('/admin-email-otp', { replace: true, state: { email } }) }
    catch (cause) { push(cause instanceof Error ? cause.message : 'Sign-in failed.', 'error') }
    finally { setSaving(false) }
  }

  return <main className="admin-screen admin-screen--center"><div className="admin-login"><div className="admin-brand admin-brand--dark"><span className="admin-brand-mark">M</span><span>JTBazar<small>ADMIN STUDIO</small></span></div><p className="admin-kicker">Authorized access only</p><h1>{otpSent ? 'Verify your email' : 'Sign in to JTBazar Admin'}</h1>{!configured ? <p>Configure the Supabase project credentials in <code>.env.local</code> before signing in.</p> : <form className="admin-form" onSubmit={(event) => void submit(event)}><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setOtpSent(false); setCode('') }} autoComplete="email" required /></label>{otpSent && <label>6-digit email code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\\D/g, '').slice(0, 6))} placeholder="000000" required /></label>}<button className="admin-button" disabled={saving || (otpSent && code.length !== 6)}>{saving ? (otpSent ? 'Verifying…' : 'Sending code…') : (otpSent ? 'Verify & sign in' : 'Send 6-digit code')}</button>{otpSent && <div className="admin-login-otp-actions"><button type="button" disabled={saving} onClick={() => { setOtpSent(false); setCode(''); setResendCooldown(0) }}>Change email</button><button type="button" disabled={saving || resendCooldown > 0} onClick={() => { setSaving(true); void sendCode().catch((cause) => push(cause instanceof Error ? cause.message : 'Could not resend code.', 'error')).finally(() => setSaving(false)) }}>{resendCooldown > 0 ? 'Resend in ' + resendCooldown + 's' : 'Resend code'}</button></div>}</form>}<p className="admin-login-note">Administrator access is available only after the registered email address is verified with a one-time 6-digit code.</p></div></main>
}

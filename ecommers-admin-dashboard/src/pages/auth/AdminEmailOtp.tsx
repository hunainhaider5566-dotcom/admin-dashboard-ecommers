import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import { getSupabase } from '../../lib/supabase'
export function AdminEmailOtp() {
 const location=useLocation(),navigate=useNavigate(),{push}=useToast()
 const email=(location.state as {email?:string}|null)?.email??''
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false)
 if(!email)return <Navigate to="/login" replace/>
 async function verify(e:FormEvent){e.preventDefault();setBusy(true);try{const {error}=await getSupabase().auth.verifyOtp({email,token:code,type:'email'});if(error)throw error;push('Email OTP verified. Now complete authenticator verification.','success');navigate('/admin',{replace:true})}catch(e){push(e instanceof Error?e.message:'Email OTP verification failed.','error')}finally{setBusy(false)}}
 return <main className="admin-screen admin-screen--center"><section className="admin-login"><div className="admin-brand admin-brand--dark"><span className="admin-brand-mark">M</span><span>JTBazar<small>ADMIN STUDIO</small></span></div><p className="admin-kicker">Second security step</p><h1>Verify your email</h1><p>Enter the six-digit code sent to <strong>{email}</strong>. You must also verify your authenticator before admin access.</p><form className="admin-form" onSubmit={e=>void verify(e)}><label>Email verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" required/></label><button className="admin-button" disabled={busy||code.length!==6}>{busy?'Verifying…':'Verify email and continue'}</button></form><button className="admin-button admin-button--outline" onClick={()=>navigate('/login',{replace:true})}>Back to sign in</button></section></main>
}
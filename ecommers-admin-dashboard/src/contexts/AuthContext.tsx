import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type AuthValue = { session: Session | null; user: User | null; profile: Profile | null; isAdmin: boolean; loading: boolean; configured: boolean; error: string | null; displayName: string | null; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

function hasVerifiedEmailOtp(session: Session | null) {
  if (!session?.access_token) return false
  try {
    const segment = session.access_token.split('.')[1]
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')
    const claims = JSON.parse(atob(normalized)) as { amr?: Array<{ method?: string }> }
    return Array.isArray(claims.amr) && claims.amr.some((entry) => entry.method === 'otp')
  } catch {
    return false
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [profile, setProfile] = useState<Profile | null>(null); const [isAdmin, setIsAdmin] = useState(false); const [loading, setLoading] = useState(isSupabaseConfigured); const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!supabase) { setLoading(false); return }; const listener = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) }); void supabase.auth.getSession().then(({ data, error: sessionError }) => { setSession(data.session); if (sessionError) setError(sessionError.message); setLoading(false) }); return () => listener.data.subscription.unsubscribe() }, [])
  useEffect(() => {
    if (!session || hasVerifiedEmailOtp(session)) return
    // Existing password/OAuth sessions must not silently bypass the email OTP flow.
    void getClient().auth.signOut({ scope: 'local' })
  }, [session?.access_token])
  useEffect(() => { let active = true; if (!session?.user || !supabase) { setProfile(null); setIsAdmin(false); return () => { active = false } }; const userId = session.user.id; setLoading(true); void Promise.all([supabase.from('profiles').select('id, full_name, phone, avatar_url, created_at, updated_at').eq('id', userId).maybeSingle(), supabase.rpc('current_user_is_admin')]).then(([profileResult, roleResult]) => { if (!active) return; if (profileResult.error) throw profileResult.error; if (roleResult.error) throw roleResult.error; setProfile(profileResult.data); setIsAdmin(Boolean(roleResult.data)); setError(null) }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Account details could not be loaded.'); setIsAdmin(false) } }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [session?.user?.id])
  const value = useMemo<AuthValue>(() => ({ session, user: session?.user ?? null, profile, isAdmin, loading, configured: isSupabaseConfigured, error, displayName: profile?.full_name ?? session?.user?.email?.split('@')[0] ?? null, signIn: async (email, password) => { const result = await getClient().auth.signInWithPassword({ email, password }); if (result.error) throw result.error }, signOut: async () => { const result = await getClient().auth.signOut(); if (result.error) throw result.error } }), [session, profile, isAdmin, loading, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
function getClient() { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value }

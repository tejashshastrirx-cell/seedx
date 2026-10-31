import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type Role = Tables<'user_roles'>['role']
type AuthState = {
  ready: boolean
  session: Session | null
  user: User | null
  emailVerified: boolean
  aal: 'aal1' | 'aal2' | null
  profile: Tables<'profiles'> | null
  roles: Tables<'user_roles'>[]
  hasRole: (role: string) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabaseConfigured)
  const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      void qc.invalidateQueries()
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  useEffect(() => {
    if (!session) { setAal(null); return }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal((data?.currentLevel as 'aal1' | 'aal2') ?? 'aal1'))
  }, [session])

  const uid = session?.user.id
  const profileQ = useQuery({
    queryKey: ['me', 'profile', uid],
    enabled: !!uid,
    queryFn: async () => (await supabase.from('profiles').select('*').eq('id', uid!).single()).data,
  })
  const rolesQ = useQuery({
    queryKey: ['me', 'roles', uid],
    enabled: !!uid,
    queryFn: async () => (await supabase.from('user_roles').select('*').eq('user_id', uid!)).data ?? [],
  })

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.refreshSession()
    setSession(data.session)
    await qc.invalidateQueries({ queryKey: ['me'] })
  }, [qc])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    qc.clear()
  }, [qc])

  const value = useMemo<AuthState>(() => {
    const roles = rolesQ.data ?? []
    return {
      ready: ready && (!uid || (!profileQ.isLoading && !rolesQ.isLoading)),
      session,
      user: session?.user ?? null,
      emailVerified: !!session?.user.email_confirmed_at,
      aal,
      profile: profileQ.data ?? null,
      roles,
      hasRole: (r: string) => roles.some((x) => x.role === r && x.status === 'active'),
      refresh,
      signOut,
    }
  }, [ready, uid, session, aal, profileQ.data, profileQ.isLoading, rolesQ.data, rolesQ.isLoading, refresh, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

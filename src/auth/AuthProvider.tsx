import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'
import { isRole, type Profile } from './roles'

interface ProfileState {
  userId: string
  profile: Profile | null
  error: boolean
}

async function fetchProfile(userId: string): Promise<ProfileState> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, floor, must_change_password')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { userId, profile: null, error: true }
  if (!data || !isRole(data.role)) return { userId, profile: null, error: false }
  return {
    userId,
    profile: { id: data.id, full_name: data.full_name, role: data.role, floor: data.floor ?? null, mustChangePassword: data.must_change_password === true },
    error: false,
  }
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Невірний email або пароль'
  if (/email not confirmed/i.test(message)) return 'Email ще не підтверджено'
  if (/rate limit|too many/i.test(message)) return 'Забагато спроб. Спробуйте пізніше'
  return 'Не вдалося увійти. Спробуйте ще раз'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [profileState, setProfileState] = useState<ProfileState | null>(null)

  useEffect(() => {
    // onAuthStateChange одразу надсилає INITIAL_SESSION, тож окремий getSession не потрібен.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionLoaded(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProfile(userId).then((state) => {
      if (!cancelled) setProfileState(state)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? translateAuthError(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfileState(null)
  }, [])

  const reloadProfile = useCallback(async () => {
    if (userId) setProfileState(await fetchProfile(userId))
  }, [userId])

  const value = useMemo<AuthContextValue>(() => {
    const current = profileState && profileState.userId === userId ? profileState : null
    let status: AuthStatus
    if (!sessionLoaded) status = 'loading'
    else if (!userId) status = 'signed_out'
    else if (!current) status = 'loading'
    else if (current.error) status = 'profile_error'
    else if (!current.profile) status = 'no_profile'
    else status = 'ready'
    return { status, session, profile: current?.profile ?? null, signIn, signOut, reloadProfile }
  }, [session, sessionLoaded, userId, profileState, signIn, signOut, reloadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

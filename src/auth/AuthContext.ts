import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from './roles'

export type AuthStatus =
  | 'loading' // перевіряємо сесію / завантажуємо профіль
  | 'signed_out'
  | 'no_profile' // користувач увійшов, але профілю немає (не активований)
  | 'profile_error' // не вдалося завантажити профіль
  | 'ready'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Повторно завантажує профіль (наприклад, після зміни пароля). */
  reloadProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

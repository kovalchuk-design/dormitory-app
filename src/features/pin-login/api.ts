import { supabase } from '../../lib/supabase'

export interface LoginUser {
  id: string
  name: string
}

export type LoginResult = { ok: true } | { ok: false; message: string; locked?: boolean }

interface LoginResponse {
  ok?: boolean
  error?: string
  kind?: 'pin' | 'password'
  attempts_left?: number
  access_token?: string
  refresh_token?: string
}

async function call(body: Record<string, unknown>): Promise<{ status: number; data: LoginResponse }> {
  const { data, error } = await supabase.functions.invoke('auth-login', { body })
  if (!error) return { status: 200, data: (data ?? {}) as LoginResponse }
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    try {
      return { status: ctx.status, data: (await ctx.json()) as LoginResponse }
    } catch {
      return { status: ctx.status, data: {} }
    }
  }
  return { status: 0, data: {} }
}

export async function listLoginUsers(): Promise<LoginUser[]> {
  const { data } = await call({ action: 'list' })
  const users = (data as { users?: LoginUser[] }).users
  if (!Array.isArray(users)) throw new Error('list_failed')
  return users
}

/** Текст помилки для екрана входу (без розкриття зайвого). */
export function loginErrorMessage(d: LoginResponse): string {
  if (d.error === 'locked') return 'Вхід заблоковано після 3 невдалих спроб. Зверніться до адміністратора, щоб розблокувати.'
  if (d.error === 'rate_limited') return 'Забагато спроб. Спробуйте трохи пізніше.'
  if (d.error === 'invalid_credentials') {
    if (d.kind === 'pin') {
      const left = d.attempts_left
      return typeof left === 'number' ? `Невірний PIN. Залишилось спроб: ${left}.` : 'Невірний PIN.'
    }
    return 'Невірний пароль.'
  }
  return 'Не вдалося увійти. Спробуйте ще раз.'
}

/** 4 цифри = PIN, інакше повний пароль. Сервер повертає сесію, яку ми підставляємо в клієнт. */
export async function signInWithSecret(userId: string, secret: string): Promise<LoginResult> {
  const { data } = await call({ action: 'signin', user_id: userId, secret })
  if (data.ok && data.access_token && data.refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    return error ? { ok: false, message: 'Не вдалося увійти. Спробуйте ще раз.' } : { ok: true }
  }
  return { ok: false, message: loginErrorMessage(data), locked: data.error === 'locked' }
}

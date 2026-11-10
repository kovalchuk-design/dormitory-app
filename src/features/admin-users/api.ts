import { supabase } from '../../lib/supabase'
import type { AppRole, CreateMode } from '../../../supabase/functions/_shared/adminUsers.ts'
import { errorText, type AdminUser } from './logic'

export class AdminApiError extends Error {
  code: string
  fields?: Record<string, string>
  constructor(code: string, fields?: Record<string, string>) {
    super(errorText(code))
    this.code = code
    this.fields = fields
  }
}

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    let code = 'unavailable'
    let fields: Record<string, string> | undefined
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const j = (await ctx.json()) as { error?: string; fields?: Record<string, string> }
        code = j.error ?? code
        fields = j.fields
      } catch {
        /* порожня або не JSON відповідь */
      }
    }
    throw new AdminApiError(code, fields)
  }
  return data as T
}

export async function listUsers(): Promise<AdminUser[]> {
  const r = await call<{ users: AdminUser[] }>('admin-list-users', {})
  return r.users
}

export interface CreateUserPayload {
  full_name: string
  email: string
  role: AppRole
  floor: number | null
  is_active: boolean
  mode: CreateMode
  pin?: string | null
}

export const createUser = (p: CreateUserPayload) =>
  call<{ user_id: string; mode: CreateMode; temporary_password?: string; pin?: string }>('admin-create-user', { ...p })

export interface UpdateUserPayload {
  user_id: string
  full_name?: string
  role?: AppRole
  floor?: number | null
  is_active?: boolean
  revoke_sessions?: boolean
  pin?: string
  generate_pin?: boolean
  unlock?: boolean
}

export const updateUser = (p: UpdateUserPayload) => call<{ revoked_sessions: number | null; pin?: string }>('admin-update-user', { ...p })

export const resetPassword = (user_id: string) =>
  call<{ temporary_password: string }>('admin-reset-password', { user_id })

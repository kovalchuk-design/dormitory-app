// Pure rules for user administration. Shared by the admin-* Edge Functions and the browser (no Deno/DOM imports).
import { pinProblem } from './pin.ts'

export const ROLES = ['admin', 'educator', 'staff_readonly'] as const
export type AppRole = (typeof ROLES)[number]

export const MIN_PASSWORD_LENGTH = 10
const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CreateMode = 'password' | 'invite' | 'pin'

export interface CreateUserInput {
  full_name: string
  email: string
  role: AppRole
  floor: number | null
  is_active: boolean
  mode: CreateMode
  /** mode 'pin': explicit 4-digit PIN; null → generated and shown once */
  pin: string | null
}

export interface UpdateUserInput {
  user_id: string
  full_name?: string
  role?: AppRole
  floor?: number | null
  is_active?: boolean
  revoke_sessions?: boolean
  /** set this 4-digit PIN */
  pin?: string
  /** generate a random PIN (returned once) */
  generate_pin?: boolean
  /** clear the failed-attempts counter / lock of the PIN */
  unlock?: boolean
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
}

function checkFloor(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  const n = typeof raw === 'string' ? Number(raw) : raw
  if (typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= 5) return { ok: true, value: n }
  return { ok: false }
}

export function validateCreateUser(input: unknown): Validation<CreateUserInput> {
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}
  const full_name = cleanName(o.full_name)
  if (full_name.length < 3 || full_name.length > 120) errors.full_name = 'Вкажіть ПІБ (від 3 до 120 символів)'
  const email = normalizeEmail(o.email)
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Вкажіть коректний email'
  const role = o.role
  if (!ROLES.includes(role as AppRole)) errors.role = 'Оберіть роль'
  const floor = checkFloor(o.floor)
  if (!floor.ok) errors.floor = 'Поверх має бути від 2 до 5'
  if (typeof o.is_active !== 'boolean') errors.is_active = 'Вкажіть статус'
  if (o.mode !== 'password' && o.mode !== 'invite' && o.mode !== 'pin') errors.mode = 'Оберіть спосіб створення'
  let pin: string | null = null
  if (o.mode === 'pin' && o.pin !== undefined && o.pin !== null && o.pin !== '') {
    const problem = pinProblem(o.pin)
    if (problem) errors.pin = problem
    else pin = o.pin as string
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      full_name, email, role: role as AppRole, pin,
      floor: floor.ok ? floor.value : null,
      is_active: o.is_active as boolean, mode: o.mode as CreateMode,
    },
  }
}

export function validateUpdateUser(input: unknown): Validation<UpdateUserInput> {
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}
  if (!isUuid(o.user_id)) errors.user_id = 'Невідомий користувач'
  const value: UpdateUserInput = { user_id: String(o.user_id) }
  if (o.full_name !== undefined) {
    const n = cleanName(o.full_name)
    if (n.length < 3 || n.length > 120) errors.full_name = 'Вкажіть ПІБ (від 3 до 120 символів)'
    else value.full_name = n
  }
  if (o.role !== undefined) {
    if (!ROLES.includes(o.role as AppRole)) errors.role = 'Оберіть роль'
    else value.role = o.role as AppRole
  }
  if (o.floor !== undefined) {
    const f = checkFloor(o.floor)
    if (!f.ok) errors.floor = 'Поверх має бути від 2 до 5'
    else value.floor = f.value
  }
  if (o.is_active !== undefined) {
    if (typeof o.is_active !== 'boolean') errors.is_active = 'Вкажіть статус'
    else value.is_active = o.is_active
  }
  if (o.revoke_sessions !== undefined) {
    if (typeof o.revoke_sessions !== 'boolean') errors.revoke_sessions = 'Некоректне значення'
    else value.revoke_sessions = o.revoke_sessions
  }
  if (o.pin !== undefined) {
    const problem = pinProblem(o.pin)
    if (problem) errors.pin = problem
    else value.pin = o.pin as string
  }
  for (const k of ['generate_pin', 'unlock'] as const) {
    if (o[k] !== undefined) {
      if (typeof o[k] !== 'boolean') errors[k] = 'Некоректне значення'
      else value[k] = o[k] as boolean
    }
  }
  if (value.pin !== undefined && value.generate_pin) errors.pin = 'Вкажіть PIN або оберіть генерацію, не обидва'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value }
}

export function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів`
  if (pw.length > 72) return 'Пароль задовгий (не більше 72 символів)'
  return null
}

// No look-alike characters (0/O, 1/l/I) — the password is read from a screen and typed on a phone.
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALL = LOWER + UPPER + DIGITS

/** Uniform random index in [0, max) via rejection sampling over crypto.getRandomValues. */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

/** Temporary password: ≥1 lower, upper and digit; default 14 chars (~80 bits). */
export function generateTempPassword(length = 14): string {
  const len = Math.max(MIN_PASSWORD_LENGTH, length)
  const chars = [LOWER, UPPER, DIGITS].map((set) => set[randomIndex(set.length)])
  while (chars.length < len) chars.push(ALL[randomIndex(ALL.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export interface ProtectionContext {
  actorId: string
  targetId: string
  current: { role: AppRole; is_active: boolean }
  change: { role?: AppRole; is_active?: boolean }
  /** Number of active admins in the system *before* the change. */
  activeAdminCount: number
}

export type ProtectionError = 'self_demote' | 'self_deactivate' | 'last_admin'

/** Protective rules: no self-demotion/deactivation, never zero active admins. */
export function protectionError(ctx: ProtectionContext): ProtectionError | null {
  const nextRole = ctx.change.role ?? ctx.current.role
  const nextActive = ctx.change.is_active ?? ctx.current.is_active
  if (ctx.actorId === ctx.targetId) {
    if (nextRole !== 'admin') return 'self_demote'
    if (!nextActive) return 'self_deactivate'
  }
  const wasActiveAdmin = ctx.current.role === 'admin' && ctx.current.is_active
  const stillActiveAdmin = nextRole === 'admin' && nextActive
  if (wasActiveAdmin && !stillActiveAdmin && ctx.activeAdminCount <= 1) return 'last_admin'
  return null
}

export const PROTECTION_MESSAGES: Record<ProtectionError, string> = {
  self_demote: 'Не можна понизити власну роль',
  self_deactivate: 'Не можна деактивувати власний обліковий запис',
  last_admin: 'У системі має лишатися хоча б один активний адміністратор',
}

import type { AppRole } from '../../../supabase/functions/_shared/adminUsers.ts'

export interface AdminUser {
  id: string
  full_name: string
  role: AppRole
  floor: number | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
  email: string | null
  last_sign_in_at: string | null
}

export interface UserFilters {
  q: string
  role: AppRole | ''
  status: 'active' | 'inactive' | ''
}

export const EMPTY_FILTERS: UserFilters = { q: '', role: '', status: '' }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function filterUsers(users: AdminUser[], f: UserFilters): AdminUser[] {
  const q = norm(f.q)
  return users.filter((u) => {
    if (f.role && u.role !== f.role) return false
    if (f.status === 'active' && !u.is_active) return false
    if (f.status === 'inactive' && u.is_active) return false
    if (q && !norm(`${u.full_name} ${u.email ?? ''}`).includes(q)) return false
    return true
  })
}

/** Active first, then by name (Ukrainian collation). */
export function sortUsers(users: AdminUser[]): AdminUser[] {
  return [...users].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name, 'uk'),
  )
}

/** "Ніколи" / "щойно" / "5 хв тому" / "3 год тому" / "2 дн. тому" / date. */
export function lastSeenLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Ще не входив'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const min = Math.floor((now.getTime() - t) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  if (min < 24 * 60) return `${Math.floor(min / 60)} год тому`
  if (min < 30 * 24 * 60) return `${Math.floor(min / 1440)} дн. тому`
  return new Date(iso).toLocaleDateString('uk-UA')
}

export const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Сесія закінчилась. Увійдіть знову',
  forbidden: 'Недостатньо прав для цієї дії',
  validation: 'Перевірте введені дані',
  email_taken: 'Користувач з таким email уже існує',
  email_rate_limited: 'Ліміт листів Supabase вичерпано. Створіть користувача з тимчасовим паролем або спробуйте пізніше',
  rate_limited: 'Забагато запитів. Зачекайте кілька хвилин',
  self_demote: 'Не можна понизити власну роль',
  self_deactivate: 'Не можна деактивувати власний обліковий запис',
  self_change: 'Для власного облікового запису ця дія недоступна (пароль змінюється в меню «Пароль»)',
  last_admin: 'У системі має лишатися хоча б один активний адміністратор',
  not_found: 'Користувача не знайдено',
  unavailable: 'Сервіс тимчасово недоступний. Спробуйте ще раз',
}

export function errorText(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || ERROR_MESSAGES.unavailable
}

import { normalizePhone } from '../../supabase/functions/_shared/questionnaire.ts'

export const STATUS_LABELS = {
  active: 'Активний',
  graduated: 'Випускник',
  left: 'Вибув',
} as const
export type StudentStatus = keyof typeof STATUS_LABELS

export function isStudentStatus(v: unknown): v is StudentStatus {
  return v === 'active' || v === 'graduated' || v === 'left'
}

export function fullName(s: { last_name: string; first_name: string; patronymic?: string | null }): string {
  return [s.last_name, s.first_name, s.patronymic].filter(Boolean).join(' ')
}

/** `tel:` link for a stored phone (normalised when possible); null when it is not dialable. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const n = normalizePhone(phone)
  if (n) return `tel:${n}`
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null
}

/** YYYY-MM-DD → DD.MM.YYYY (no timezone shifts). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
}

/** Message from a PostgREST / Error value, with the DB error code prefix (e.g. NOT_PENDING) translated. */
export function errorMessage(e: unknown): string {
  const raw = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const known: Record<string, string> = {
    NOT_PENDING: 'Цю версію вже оброблено.',
    NOT_FOUND: 'Запис не знайдено.',
    FORBIDDEN: 'Недостатньо прав для цієї дії.',
    STUDENT_NOT_ACTIVE: 'Учень не активний — посилання створити не можна.',
    INVALID: 'Некоректні дані.',
  }
  for (const [code, text] of Object.entries(known)) if (raw.includes(code)) return text
  if (/permission denied|row-level security/i.test(raw)) return 'Недостатньо прав для цієї дії.'
  if (/failed to fetch|networkerror|load failed|network request failed|timeout/i.test(raw)) {
    return 'Немає зв’язку із сервером. Перевірте інтернет і спробуйте ще раз.'
  }
  if (/JWT|not authenticated|session/i.test(raw) && /expired|invalid|missing|not/i.test(raw)) return 'Сеанс завершився. Увійдіть знову.'
  // Технічний (англомовний) текст користувачу не показуємо — лише в консоль для розробника.
  if (raw && !/[а-яіїєґ]/i.test(raw)) {
    console.error('[помилка]', e)
    return 'Не вдалося виконати дію. Спробуйте ще раз; якщо повторюється — повідомте адміністратора.'
  }
  return raw || 'Невідома помилка'
}

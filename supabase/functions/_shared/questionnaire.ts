// Questionnaire validation. Pure TypeScript with no imports: used by the public form (browser)
// AND by the submit-questionnaire Edge Function (Deno), so both apply the very same rules.

export interface QuestionnaireData {
  full_name: string
  birth_date: string
  room: string
  group_number: string
  profession: string
  class_teacher: string
  master: string
  address: string
  student_phone: string
  mother_name: string
  mother_phone: string
  father_name: string
  father_phone: string
  guardian_name: string
  guardian_phone: string
  school_activities: string
  college_plans: string
  social_status: string
  allergies: string
  chronic_conditions: string
  consent: boolean
}

export type FieldKey = keyof QuestionnaireData
export type FieldErrors = Partial<Record<FieldKey, string>>

export const EMPTY_QUESTIONNAIRE: QuestionnaireData = {
  full_name: '', birth_date: '', room: '', group_number: '', profession: '', class_teacher: '', master: '',
  address: '', student_phone: '', mother_name: '', mother_phone: '', father_name: '', father_phone: '',
  guardian_name: '', guardian_phone: '', school_activities: '', college_plans: '', social_status: '',
  allergies: '', chronic_conditions: '', consent: false,
}

/** Max lengths (characters) — enforced on both sides. */
export const MAX_LEN: Record<Exclude<FieldKey, 'consent'>, number> = {
  full_name: 150, birth_date: 10, room: 10, group_number: 20, profession: 100, class_teacher: 150, master: 150,
  address: 300, student_phone: 16, mother_name: 150, mother_phone: 16, father_name: 150, father_phone: 16,
  guardian_name: 150, guardian_phone: 16, school_activities: 1000, college_plans: 1000, social_status: 500,
  allergies: 1000, chronic_conditions: 1000,
}

// Усі поля анкети обов'язкові, крім: номера кімнати (інформаційний, може бути не призначений) та опікуна (необов'язково).
const REQUIRED: Exclude<FieldKey, 'consent'>[] = [
  'full_name', 'birth_date', 'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone',
  'mother_name', 'mother_phone', 'father_name', 'father_phone',
  'school_activities', 'college_plans', 'social_status', 'allergies', 'chronic_conditions',
]
const MULTILINE = new Set<FieldKey>(['school_activities', 'college_plans', 'social_status', 'allergies', 'chronic_conditions', 'address'])
const PHONE_FIELDS = ['student_phone', 'mother_phone', 'father_phone', 'guardian_phone'] as const
const PERSON_PAIRS = [
  ['mother_name', 'mother_phone'],
  ['father_name', 'father_phone'],
  ['guardian_name', 'guardian_phone'],
] as const

/** Returns +380XXXXXXXXX or null. Accepts +380…, 380…, 0XXXXXXXXX with spaces, dashes, dots, parentheses. */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s().-]/g, '')
  if (/^\+380\d{9}$/.test(s)) return s
  if (/^380\d{9}$/.test(s)) return `+${s}`
  if (/^0\d{9}$/.test(s)) return `+38${s}`
  return null
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null
}

/** Real calendar date in YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function ageOn(birth: string, today: Date): number {
  const b = new Date(`${birth}T00:00:00Z`)
  let age = today.getUTCFullYear() - b.getUTCFullYear()
  const m = today.getUTCMonth() - b.getUTCMonth()
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age -= 1
  return age
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

function clean(value: unknown, key: FieldKey): string {
  if (typeof value !== 'string') return ''
  let v = value.normalize('NFC').replace(/\r\n?/g, '\n')
  if (!MULTILINE.has(key)) v = v.replace(/\s+/g, ' ')
  return v.trim()
}

export type ValidationResult =
  | { ok: true; value: QuestionnaireData }
  | { ok: false; errors: FieldErrors }

/**
 * Validates and normalises a questionnaire. Unknown keys are dropped; phones are normalised to +380XXXXXXXXX.
 * `today` is injectable for tests.
 */
export function validateQuestionnaire(input: unknown, today: Date = new Date()): ValidationResult {
  const errors: FieldErrors = {}
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const v: QuestionnaireData = { ...EMPTY_QUESTIONNAIRE }

  for (const key of Object.keys(MAX_LEN) as Exclude<FieldKey, 'consent'>[]) {
    const raw = src[key]
    if (raw != null && typeof raw !== 'string') {
      errors[key] = 'Некоректне значення'
      continue
    }
    const val = clean(raw, key)
    if (CONTROL.test(val)) errors[key] = 'Недопустимі символи'
    else if (val.length > MAX_LEN[key]) errors[key] = `Максимум ${MAX_LEN[key]} символів`
    v[key] = val
  }
  v.consent = src.consent === true

  for (const key of REQUIRED) {
    if (!v[key] && !errors[key]) errors[key] = "Обов'язкове поле"
  }

  if (v.full_name && !errors.full_name && v.full_name.split(' ').length < 2) {
    errors.full_name = 'Вкажіть прізвище та імʼя'
  }
  if (v.birth_date && !errors.birth_date) {
    if (!isIsoDate(v.birth_date)) errors.birth_date = 'Вкажіть коректну дату'
    else {
      const age = ageOn(v.birth_date, today)
      if (age < 12 || age > 25) errors.birth_date = 'Перевірте дату народження'
    }
  }

  for (const key of PHONE_FIELDS) {
    if (!v[key] || errors[key]) continue
    const n = normalizePhone(v[key])
    if (n) v[key] = n
    else errors[key] = 'Формат: +380XXXXXXXXX'
  }

  // опікун необов'язковий, але ПІБ і телефон вказуються парою
  for (const [nameKey, phoneKey] of PERSON_PAIRS) {
    if (v[nameKey] && !v[phoneKey] && !errors[phoneKey]) errors[phoneKey] = 'Вкажіть телефон'
    if (!v[nameKey] && v[phoneKey] && !errors[nameKey]) errors[nameKey] = 'Вкажіть ПІБ'
  }

  if (!v.consent) errors.consent = 'Потрібна згода на обробку персональних даних'

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: v }
}

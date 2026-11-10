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
  guardian_relation: string
  school_activities: string
  college_plans: string
  /** Соціальний статус (чекліст із паперової анкети): коди з SOCIAL_OPTIONS. */
  social_codes: string[]
  social_children: string
  social_ato: string
  social_zsu: string
  /** Людиночитний текст — формується сервером із social_codes, від клієнта не приймається. */
  social_status: string
  allergies: string
  chronic_conditions: string
  consent: boolean
}

export type FieldKey = keyof QuestionnaireData
/** Поля, що вводяться як звичайний текст. */
export type TextKey = Exclude<FieldKey, 'consent' | 'social_codes' | 'social_status'>
export type FieldErrors = Partial<Record<FieldKey, string>>

export const EMPTY_QUESTIONNAIRE: QuestionnaireData = {
  full_name: '', birth_date: '', room: '', group_number: '', profession: '', class_teacher: '', master: '',
  address: '', student_phone: '', mother_name: '', mother_phone: '', father_name: '', father_phone: '',
  guardian_name: '', guardian_phone: '', guardian_relation: '', school_activities: '', college_plans: '',
  social_codes: [], social_children: '', social_ato: '', social_zsu: '', social_status: '',
  allergies: '', chronic_conditions: '', consent: false,
}

/** Max lengths (characters) — enforced on both sides. */
export const MAX_LEN: Record<TextKey, number> = {
  full_name: 150, birth_date: 10, room: 10, group_number: 20, profession: 200, class_teacher: 150, master: 150,
  address: 300, student_phone: 16, mother_name: 150, mother_phone: 16, father_name: 150, father_phone: 16,
  guardian_name: 150, guardian_phone: 16, guardian_relation: 60, school_activities: 1000, college_plans: 1000,
  social_children: 2, social_ato: 200, social_zsu: 200, allergies: 1000, chronic_conditions: 1000,
}

// Усі поля анкети обов'язкові, крім: номера кімнати (інформаційний, може бути не призначений), опікуна (необов'язково)
// та медичних відповідей (алергії, хронічні хвороби): діти можуть їх не знати, вихователі уточнять пізніше.
// Телефон мами/тата обов'язковий, якщо вказано їхнє ПІБ; якщо когось немає (сирота, один з батьків) — у ПІБ пишуть «немає».
const REQUIRED: TextKey[] = [
  'full_name', 'birth_date', 'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone',
  'mother_name', 'father_name',
  'school_activities', 'college_plans',
]
const MULTILINE = new Set<FieldKey>(['school_activities', 'college_plans', 'allergies', 'chronic_conditions', 'address'])
/** Канонічне значення «такої людини немає» (зберігається у ПІБ). */
export const NONE = 'немає'
const NONE_WORDS = new Set(['немає', 'нема', 'відсутній', 'відсутня', 'немає.', 'нема.', '-', '—', '–', 'н/д', 'no'])
/** Чи означає введений текст «немає». */
export function isNone(v: string): boolean {
  return NONE_WORDS.has(v.trim().toLowerCase())
}

/** Соціальний статус — як у паперовій анкеті (пункт 13), плюс «жодного з переліку». */
export const SOCIAL_OPTIONS = [
  { code: 'orphan', label: 'Сирота' },
  { code: 'half_orphan', label: 'Напівсирота' },
  { code: 'divorced', label: 'Батьки розлучені' },
  { code: 'disability', label: 'Дитина з інвалідністю' },
  { code: 'large_family', label: "Багатодітна сім'я", detail: 'social_children' },
  { code: 'ato', label: 'Учасники АТО', detail: 'social_ato' },
  { code: 'zsu', label: 'Служба в ЗСУ', detail: 'social_zsu' },
  { code: 'vpo', label: 'Статус ВПО' },
  { code: 'none', label: 'Жодного з переліку' },
] as const
export type SocialCode = (typeof SOCIAL_OPTIONS)[number]['code']
const SOCIAL_CODES = new Set<string>(SOCIAL_OPTIONS.map((o) => o.code))

/** Текст для картки / порівняння версій, напр. «Багатодітна сімʼя (неповнолітніх дітей: 3); Служба в ЗСУ (Воробйов В. — тато)». */
export function composeSocialStatus(
  codes: readonly string[],
  d: { social_children: string; social_ato: string; social_zsu: string },
): string {
  return SOCIAL_OPTIONS.filter((o) => codes.includes(o.code))
    .map((o) => {
      if (o.code === 'large_family') return `${o.label} (неповнолітніх дітей: ${d.social_children})`
      if (o.code === 'ato') return `${o.label} (${d.social_ato})`
      if (o.code === 'zsu') return `${o.label} (${d.social_zsu})`
      return o.label
    })
    .join('; ')
}

const PHONE_FIELDS = ['student_phone', 'mother_phone', 'father_phone', 'guardian_phone'] as const

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

  for (const key of Object.keys(MAX_LEN) as TextKey[]) {
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

  // мама / тато: або ПІБ + телефон, або «немає» (телефон тоді порожній)
  const none = { mother: false, father: false }
  for (const who of ['mother', 'father'] as const) {
    const nameKey = `${who}_name` as const
    const phoneKey = `${who}_phone` as const
    if (!v[nameKey] || errors[nameKey]) continue
    if (isNone(v[nameKey])) {
      none[who] = true
      v[nameKey] = NONE
      if (v[phoneKey] && !isNone(v[phoneKey])) errors[phoneKey] = 'Якщо людини немає — залиште телефон порожнім'
      else v[phoneKey] = ''
    } else if (!v[phoneKey] && !errors[phoneKey]) errors[phoneKey] = "Обов'язкове поле"
  }

  for (const key of PHONE_FIELDS) {
    if (!v[key] || errors[key]) continue
    const n = normalizePhone(v[key])
    if (n) v[key] = n
    else errors[key] = 'Формат: +380XXXXXXXXX'
  }

  // опікун (або інша близька людина: бабуся, дядько…) необов'язковий, але ПІБ, телефон і ким доводиться — разом
  const g = ['guardian_name', 'guardian_phone', 'guardian_relation'] as const
  if (g.some((k) => v[k])) {
    for (const k of g) if (!v[k] && !errors[k]) errors[k] = "Обов'язкове поле"
  }
  // сирота / обидвох батьків немає — потрібен опікун, щоб було кому телефонувати
  if (none.mother && none.father && !v.guardian_name && !errors.guardian_name) {
    errors.guardian_name = 'Якщо батьків немає — вкажіть опікуна або близьку людину'
  }

  // соціальний статус: чекліст
  const rawCodes = Array.isArray(src.social_codes) ? src.social_codes : null
  if (!rawCodes || rawCodes.some((c) => typeof c !== 'string' || !SOCIAL_CODES.has(c))) {
    errors.social_codes = 'Оберіть варіант зі списку'
  } else {
    const codes = SOCIAL_OPTIONS.map((o) => o.code).filter((c) => rawCodes.includes(c))
    if (codes.length === 0) errors.social_codes = 'Оберіть хоча б один варіант (або «Жодного з переліку»)'
    else if (codes.includes('none') && codes.length > 1) errors.social_codes = '«Жодного з переліку» не поєднується з іншими варіантами'
    else {
      v.social_codes = codes
      const need = (code: SocialCode, key: 'social_children' | 'social_ato' | 'social_zsu') => {
        if (!codes.includes(code)) v[key] = '' // деталі невибраного пункту відкидаємо
        else if (!v[key] && !errors[key]) errors[key] = key === 'social_children' ? 'Вкажіть кількість дітей' : 'Вкажіть, хто саме'
      }
      need('large_family', 'social_children')
      need('ato', 'social_ato')
      need('zsu', 'social_zsu')
      if (v.social_children && !errors.social_children && !/^[1-9]\d?$/.test(v.social_children)) errors.social_children = 'Вкажіть число'
      v.social_status = composeSocialStatus(codes, v)
    }
  }
  if (errors.social_codes) {
    v.social_codes = []
    v.social_children = v.social_ato = v.social_zsu = ''
  }

  if (!v.consent) errors.consent = 'Потрібна згода на обробку персональних даних'

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: v }
}

import { MAX_LEN, normalizePhone, SOCIAL_OPTIONS } from '../../supabase/functions/_shared/questionnaire.ts'

/** Поля анкети, які вихователь може внести одразу при створенні учня. Усі необов'язкові. */
export interface ProfileExtra {
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
  guardian_relation: string
  guardian_phone: string
  school_activities: string
  college_plans: string
  social_codes: string[]
  social_children: string
  social_ato: string
  social_zsu: string
  allergies: string
  chronic_conditions: string
}

export const EMPTY_EXTRA: ProfileExtra = {
  group_number: '', profession: '', class_teacher: '', master: '', address: '', student_phone: '',
  mother_name: '', mother_phone: '', father_name: '', father_phone: '',
  guardian_name: '', guardian_relation: '', guardian_phone: '',
  school_activities: '', college_plans: '', social_codes: [], social_children: '', social_ato: '', social_zsu: '',
  allergies: '', chronic_conditions: '',
}

export type ExtraErrors = Partial<Record<keyof ProfileExtra, string>>

const PHONES = ['student_phone', 'mother_phone', 'father_phone', 'guardian_phone'] as const
const TEXT_KEYS = Object.keys(EMPTY_EXTRA).filter((k) => k !== 'social_codes') as (keyof Omit<ProfileExtra, 'social_codes'>)[]

/** Перевірка лише того, що вказано: телефони та довжини. Порожнє — нормально. */
export function validateExtra(x: ProfileExtra): ExtraErrors {
  const e: ExtraErrors = {}
  for (const k of TEXT_KEYS) {
    const v = x[k].trim()
    if (v.length > MAX_LEN[k]) e[k] = `Занадто довго (максимум ${MAX_LEN[k]} символів)`
  }
  for (const k of PHONES) {
    const v = x[k].trim()
    if (v && !normalizePhone(v)) e[k] = 'Невірний номер. Приклад: +380671234567'
  }
  if (x.social_children.trim() && !/^\d{1,2}$/.test(x.social_children.trim())) e.social_children = 'Вкажіть число'
  return e
}

const t = (v: string) => v.trim()
const nn = (v: string) => (t(v) === '' ? null : t(v))

export function hasProfileData(x: ProfileExtra): boolean {
  const keys: (keyof ProfileExtra)[] = [
    'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone', 'mother_name', 'mother_phone',
    'father_name', 'father_phone', 'guardian_name', 'guardian_relation', 'guardian_phone', 'school_activities', 'college_plans',
  ]
  return keys.some((k) => t(x[k] as string) !== '') || x.social_codes.length > 0
}

export function hasMedicalData(x: ProfileExtra): boolean {
  return t(x.allergies) !== '' || t(x.chronic_conditions) !== ''
}

/** Читабельний соціальний статус («Багатодітна сімʼя (неповнолітніх дітей: 3); …»); деталі, яких не вказано, пропускаються. */
export function socialText(x: ProfileExtra): string | null {
  if (x.social_codes.length === 0) return null
  return SOCIAL_OPTIONS.filter((o) => x.social_codes.includes(o.code))
    .map((o) => {
      if (o.code === 'large_family' && t(x.social_children)) return `${o.label} (неповнолітніх дітей: ${t(x.social_children)})`
      if (o.code === 'ato' && t(x.social_ato)) return `${o.label} (${t(x.social_ato)})`
      if (o.code === 'zsu' && t(x.social_zsu)) return `${o.label} (${t(x.social_zsu)})`
      return o.label
    })
    .join('; ')
}

/** Рядок для student_profiles (версія «pending»; далі її підтверджує approve_student_profile). */
export function toProfileRow(studentId: string, x: ProfileExtra) {
  const phone = (v: string) => (t(v) ? normalizePhone(t(v)) : null)
  return {
    student_id: studentId,
    status: 'pending' as const,
    group_number: nn(x.group_number), profession: nn(x.profession), class_teacher: nn(x.class_teacher), master: nn(x.master),
    address: nn(x.address), student_phone: phone(x.student_phone),
    mother_name: nn(x.mother_name), mother_phone: phone(x.mother_phone),
    father_name: nn(x.father_name), father_phone: phone(x.father_phone),
    guardian_name: nn(x.guardian_name), guardian_relation: nn(x.guardian_relation), guardian_phone: phone(x.guardian_phone),
    school_activities: nn(x.school_activities), college_plans: nn(x.college_plans),
    social_status: socialText(x),
    social_status_data: x.social_codes.length === 0 ? null : {
      codes: x.social_codes, children_count: nn(x.social_children), ato: nn(x.social_ato), zsu: nn(x.social_zsu),
    },
  }
}

/**
 * Режим «Батьки / Опікун», як в анкеті учня: обраний варіант лишається, другий очищається.
 * У режимі «Опікун» батьків позначаємо «немає» — лише якщо опікуна вказано (інакше нічого не вигадуємо).
 */
export function applyContactMode(x: ProfileExtra, mode: 'parents' | 'guardian'): ProfileExtra {
  if (mode === 'guardian') {
    const hasGuardian = x.guardian_name.trim() !== ''
    return { ...x, mother_name: hasGuardian ? 'немає' : '', mother_phone: '', father_name: hasGuardian ? 'немає' : '', father_phone: '' }
  }
  return { ...x, guardian_name: '', guardian_relation: '', guardian_phone: '' }
}

type ProfileRowLike = Partial<Record<string, unknown>> & { social_status_data?: unknown }

const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** Поточна затверджена анкета + медичні дані → значення полів форми редагування. */
export function extraFromProfile(
  p: ProfileRowLike | null, med: { allergies: string | null; chronic_conditions: string | null } | null,
): ProfileExtra {
  const d = p?.social_status_data && typeof p.social_status_data === 'object' ? (p.social_status_data as Record<string, unknown>) : null
  return {
    group_number: s(p?.group_number), profession: s(p?.profession), class_teacher: s(p?.class_teacher), master: s(p?.master),
    address: s(p?.address), student_phone: s(p?.student_phone),
    mother_name: s(p?.mother_name), mother_phone: s(p?.mother_phone), father_name: s(p?.father_name), father_phone: s(p?.father_phone),
    guardian_name: s(p?.guardian_name), guardian_relation: s(p?.guardian_relation), guardian_phone: s(p?.guardian_phone),
    school_activities: s(p?.school_activities), college_plans: s(p?.college_plans),
    social_codes: Array.isArray(d?.codes) ? (d.codes as string[]) : [],
    social_children: s(d?.children_count), social_ato: s(d?.ato), social_zsu: s(d?.zsu),
    allergies: med?.allergies ?? '', chronic_conditions: med?.chronic_conditions ?? '',
  }
}

const PROFILE_KEYS = [
  'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone', 'mother_name', 'mother_phone',
  'father_name', 'father_phone', 'guardian_name', 'guardian_relation', 'guardian_phone', 'school_activities', 'college_plans',
] as const

/** Чи відрізняється анкета у формі від чинної (тоді створюємо нову версію). Порівнюємо після нормалізації. */
export function profileChanged(current: ProfileRowLike | null, x: ProfileExtra, legacySocial: boolean): boolean {
  if (!current) return hasProfileData(x)
  const row = toProfileRow('', x) as Record<string, unknown>
  for (const k of PROFILE_KEYS) {
    if (((row[k] as string | null) ?? '') !== s(current[k]).trim()) return true
  }
  if (legacySocial) return false
  return ((row.social_status as string | null) ?? '') !== s(current.social_status).trim()
}

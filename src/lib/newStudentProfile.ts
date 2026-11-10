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

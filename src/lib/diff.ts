export interface FieldDef {
  key: string
  label: string
}

/** Поля анкети (student_profiles), що порівнюються між версіями. */
export const PROFILE_FIELDS: FieldDef[] = [
  { key: 'submitted_full_name', label: 'ПІБ' },
  { key: 'submitted_birth_date', label: 'Дата народження' },
  { key: 'submitted_room', label: 'Кімната (зі слів учня)' },
  { key: 'group_number', label: 'Номер групи' },
  { key: 'profession', label: 'Професія' },
  { key: 'class_teacher', label: 'Класний керівник' },
  { key: 'master', label: 'Майстер' },
  { key: 'address', label: 'Адреса проживання' },
  { key: 'student_phone', label: 'Телефон учня' },
  { key: 'mother_name', label: 'Мама (ПІБ)' },
  { key: 'mother_phone', label: 'Мама (телефон)' },
  { key: 'father_name', label: 'Тато (ПІБ)' },
  { key: 'father_phone', label: 'Тато (телефон)' },
  { key: 'guardian_name', label: 'Опікун (ПІБ)' },
  { key: 'guardian_relation', label: 'Опікун (ким доводиться)' },
  { key: 'guardian_phone', label: 'Опікун (телефон)' },
  { key: 'school_activities', label: 'Чим займався у школі' },
  { key: 'college_plans', label: 'Чим хоче займатися у коледжі' },
  { key: 'social_status', label: 'Соціальний статус' },
]

/** Медичні поля (student_medical) — окремий блок, лише для admin/educator. */
export const MEDICAL_FIELDS: FieldDef[] = [
  { key: 'allergies', label: 'Алергії' },
  { key: 'chronic_conditions', label: 'Хронічні хвороби' },
]

export interface FieldDiff {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
}

type Rec = Record<string, unknown> | null | undefined

const norm = (v: unknown): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())

/** Порівнює дві версії по списку полів. `before = null` — версії для порівняння немає (усе нове). */
export function diffRecords(before: Rec, after: Rec, fields: FieldDef[]): FieldDiff[] {
  return fields.map(({ key, label }) => {
    const b = norm(before?.[key])
    const a = norm(after?.[key])
    return { key, label, before: b, after: a, changed: a !== b }
  })
}

export const changedCount = (d: FieldDiff[]): number => d.filter((x) => x.changed).length

/** Підставляє ПІБ/дату народження з картки учня, якщо у версії анкети їх ще немає (стара/ручна версія). */
export function withStudentIdentity(
  profile: Record<string, unknown> | null,
  student: { last_name: string; first_name: string; patronymic: string | null; birth_date: string | null },
): Record<string, unknown> | null {
  if (!profile) return null
  return {
    ...profile,
    submitted_full_name:
      profile.submitted_full_name ?? [student.last_name, student.first_name, student.patronymic].filter(Boolean).join(' '),
    submitted_birth_date: profile.submitted_birth_date ?? student.birth_date,
  }
}

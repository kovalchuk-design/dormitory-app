import { toCsv } from './csv'
import { fullName, STATUS_LABELS, type StudentStatus } from './format'

export interface StudentRow {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
  birth_date: string | null
  grade: number
  status: StudentStatus
  room: string | null
  floor: number | null
  student_phone: string | null
  mother_phone: string | null
  father_phone: string | null
  guardian_phone: string | null
  /** Номер групи й соціальний статус — з чинної анкети; примітка — students.notes (позначки при наповненні бази). */
  group_number: string | null
  social_status: string | null
  notes: string | null
}

export interface Filters {
  query: string
  grade: string // '' | '9' | '10' | '11'
  /** Обрані поверхи (порожньо — усі). */
  floors: number[]
  /** Обрані категорії соціального статусу (див. SOCIAL_FILTERS; порожньо — усі). */
  social: string[]
  room: string // '' | номер кімнати
  status: string // '' | active | graduated | left
  unplacedOnly: boolean
  /** Лише записи з примітками (потребують перевірки/уточнення). */
  notesOnly: boolean
}

export const DEFAULT_FILTERS: Filters = { query: '', grade: '', floors: [], social: [], room: '', status: 'active', unplacedOnly: false, notesOnly: false }

const digits = (s: string) => s.replace(/\D/g, '')
const fold = (s: string) => s.toLowerCase().replace(/[’ʼ`']/g, "'")

export function matchesQuery(r: StudentRow, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  const qDigits = digits(q)
  const phoneQuery = qDigits.length >= 3 && qDigits.length >= q.replace(/[\s+()-]/g, '').length
  if (phoneQuery) {
    const phones = [r.student_phone, r.mother_phone, r.father_phone, r.guardian_phone]
    if (phones.some((p) => p && digits(p).includes(qDigits))) return true
    // дозволяємо також номер кімнати, що складається лише з цифр
    return r.room != null && r.room.toLowerCase() === q
  }
  const hay = fold(`${fullName(r)} ${r.room ?? ''}`)
  return q.split(/\s+/).every((t) => hay.includes(t))
}

/** Категорії соціального статусу для фільтра. Тексти в базі — переважно з міток анкети, тож шукаємо за ключовими словами. */
const L = 'а-яіїєґ'
export const SOCIAL_FILTERS: { code: string; label: string; test: RegExp }[] = [
  { code: 'orphan', label: 'Сирота', test: new RegExp(`(^|;\\s*)сирота`) },
  { code: 'half_orphan', label: 'Напівсирота', test: /напівсирота/ },
  { code: 'divorced', label: 'Батьки розлучені', test: /розлучен/ },
  { code: 'disability', label: 'Дитина з інвалідністю', test: /інвалід/ },
  { code: 'large_family', label: "Багатодітна сім'я", test: /багатодітн/ },
  { code: 'ato', label: 'Учасники АТО', test: new RegExp(`(^|[^${L}])ато($|[^${L}])`) },
  { code: 'zsu', label: 'Служба в ЗСУ', test: /зсу/ },
  { code: 'vpo', label: 'Статус ВПО', test: new RegExp(`(^|[^${L}])впо($|[^${L}])`) },
]

export function matchesSocial(text: string | null, codes: string[]): boolean {
  if (!text) return false
  const t = fold(text)
  return SOCIAL_FILTERS.some((o) => codes.includes(o.code) && o.test.test(t))
}

export function filterStudents(rows: StudentRow[], f: Filters): StudentRow[] {
  return rows.filter(
    (r) =>
      matchesQuery(r, f.query) &&
      (!f.grade || r.grade === Number(f.grade)) &&
      (f.floors.length === 0 || (r.floor != null && f.floors.includes(r.floor))) &&
      (f.social.length === 0 || matchesSocial(r.social_status, f.social)) &&
      (!f.room || r.room === f.room) &&
      (!f.status || r.status === f.status) &&
      (!f.unplacedOnly || r.room == null) &&
      (!f.notesOnly || (r.notes ?? '').trim() !== ''),
  )
}

export type SortKey = 'name' | 'grade' | 'room' | 'floor' | 'status' | 'group'
export type SortDir = 'asc' | 'desc'

const collator = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' })

export function sortStudents(rows: StudentRow[], key: SortKey, dir: SortDir): StudentRow[] {
  const sign = dir === 'asc' ? 1 : -1
  const byName = (a: StudentRow, b: StudentRow) => collator.compare(fullName(a), fullName(b))
  return [...rows].sort((a, b) => {
    let c = 0
    switch (key) {
      case 'name':
        return sign * byName(a, b)
      case 'grade':
        c = a.grade - b.grade
        break
      case 'status':
        c = collator.compare(a.status, b.status)
        break
      case 'group':
        // записи без групи — в кінці
        if (!a.group_number || !b.group_number) {
          if (!a.group_number && !b.group_number) return byName(a, b)
          return a.group_number ? -1 : 1
        }
        c = collator.compare(a.group_number, b.group_number)
        break
      case 'room':
      case 'floor': {
        const av = key === 'room' ? a.room : a.floor
        const bv = key === 'room' ? b.room : b.floor
        if (av == null || bv == null) {
          // нерозподілені завжди в кінці, незалежно від напрямку
          if (av == null && bv == null) return byName(a, b)
          return av == null ? 1 : -1
        }
        c = key === 'room' ? collator.compare(String(av), String(bv)) : Number(av) - Number(bv)
        break
      }
    }
    return c !== 0 ? sign * c : byName(a, b)
  })
}

export const CSV_HEADERS = [
  'ПІБ', 'Клас', 'Статус', 'Поверх', 'Кімната', 'Телефон учня', 'Мама', 'Тато', 'Опікун',
]

/** Експорт того, що зараз показано (з урахуванням фільтрів). Медичних даних немає. */
export function studentsToCsv(rows: StudentRow[]): string {
  return toCsv(
    CSV_HEADERS,
    rows.map((r) => [
      fullName(r), r.grade, STATUS_LABELS[r.status], r.floor ?? '', r.room ?? 'нерозподілений',
      r.student_phone ?? '', r.mother_phone ?? '', r.father_phone ?? '', r.guardian_phone ?? '',
    ]),
  )
}

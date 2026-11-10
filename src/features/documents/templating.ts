/**
 * Автозаповнення шаблонів .docx. Синтаксис — подвійні фігурні дужки: {{student.full_name}}.
 * Цикли (рядки таблиці зі списком учнів): {{#students}} … {{full_name}} … {{/students}}.
 */

export interface PlaceholderDoc {
  key: string
  description: string
  example: string
}

export const GLOBAL_PLACEHOLDERS: PlaceholderDoc[] = [
  { key: 'date', description: 'Сьогоднішня дата (дд.мм.рррр)', example: '09.11.2026' },
  { key: 'year', description: 'Поточний навчальний рік', example: '2026/2027' },
  { key: 'educator.full_name', description: 'ПІБ користувача, який формує документ', example: 'Іваненко Марія Петрівна' },
  { key: 'room', description: 'Номер кімнати (якщо всі вибрані учні в одній кімнаті; інакше порожньо)', example: '305' },
  { key: 'floor', description: 'Поверх (якщо всі вибрані учні на одному поверсі; інакше порожньо)', example: '3' },
  { key: 'count', description: 'Кількість вибраних учнів', example: '24' },
  { key: 'student.*', description: 'Поля першого вибраного учня (див. нижче) — зручно для документа на одного учня', example: '{{student.full_name}}' },
  { key: 'students', description: 'Список усіх вибраних учнів — для циклу {{#students}}…{{/students}}', example: '' },
]

export const STUDENT_PLACEHOLDERS: PlaceholderDoc[] = [
  { key: 'full_name', description: 'Прізвище Ім’я По батькові', example: 'Шевченко Тарас Григорович' },
  { key: 'short_name', description: 'Прізвище І.П.', example: 'Шевченко Т.Г.' },
  { key: 'last_name', description: 'Прізвище', example: 'Шевченко' },
  { key: 'first_name', description: 'Ім’я', example: 'Тарас' },
  { key: 'patronymic', description: 'По батькові', example: 'Григорович' },
  { key: 'birth_date', description: 'Дата народження', example: '09.03.2010' },
  { key: 'grade', description: 'Клас (9–11)', example: '10' },
  { key: 'group_number', description: 'Група (з анкети)', example: '12' },
  { key: 'profession', description: 'Професія (з анкети)', example: 'Кухар' },
  { key: 'room', description: 'Кімната учня', example: '305' },
  { key: 'floor', description: 'Поверх учня', example: '3' },
  { key: 'phone', description: 'Телефон учня', example: '+380000000000' },
  { key: 'address', description: 'Адреса', example: 'м. Київ, вул. Прикладна, 1' },
  { key: 'mother_name', description: 'ПІБ матері', example: '' },
  { key: 'mother_phone', description: 'Телефон матері', example: '' },
  { key: 'father_name', description: 'ПІБ батька', example: '' },
  { key: 'father_phone', description: 'Телефон батька', example: '' },
  { key: 'guardian_name', description: 'ПІБ опікуна', example: '' },
  { key: 'guardian_phone', description: 'Телефон опікуна', example: '' },
  { key: 'class_teacher', description: 'Класний керівник', example: '' },
  { key: 'master', description: 'Майстер', example: '' },
  { key: 'index', description: 'Лише в циклі: порядковий номер (1, 2, 3…)', example: '1' },
]

/** Медичні дані (student_medical) у шаблони НЕ підставляються навмисно. */

export interface StudentSource {
  last_name: string
  first_name: string
  patronymic?: string | null
  birth_date?: string | null // YYYY-MM-DD
  grade: number | null
  room?: string | null
  floor?: number | null
  // поля затвердженої анкети (student_profiles, status = approved)
  student_phone?: string | null
  address?: string | null
  group_number?: string | null
  profession?: string | null
  class_teacher?: string | null
  master?: string | null
  mother_name?: string | null
  mother_phone?: string | null
  father_name?: string | null
  father_phone?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (m) return `${m[3]}.${m[2]}.${m[1]}`
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

export const fullName = (s: Pick<StudentSource, 'last_name' | 'first_name' | 'patronymic'>) =>
  [s.last_name, s.first_name, s.patronymic].filter(Boolean).join(' ')

export function shortName(s: Pick<StudentSource, 'last_name' | 'first_name' | 'patronymic'>): string {
  const initial = (n?: string | null) => (n && n.trim() ? `${n.trim()[0].toLocaleUpperCase('uk')}.` : '')
  return [s.last_name, initial(s.first_name) + initial(s.patronymic)].filter(Boolean).join(' ')
}

export function buildStudentFields(s: StudentSource): Record<string, string> {
  return {
    full_name: fullName(s),
    short_name: shortName(s),
    last_name: s.last_name,
    first_name: s.first_name,
    patronymic: s.patronymic ?? '',
    birth_date: formatDate(s.birth_date),
    grade: s.grade == null ? '' : String(s.grade),
    group_number: s.group_number ?? '',
    profession: s.profession ?? '',
    room: s.room ?? '',
    floor: s.floor != null ? String(s.floor) : '',
    phone: s.student_phone ?? '',
    address: s.address ?? '',
    mother_name: s.mother_name ?? '',
    mother_phone: s.mother_phone ?? '',
    father_name: s.father_name ?? '',
    father_phone: s.father_phone ?? '',
    guardian_name: s.guardian_name ?? '',
    guardian_phone: s.guardian_phone ?? '',
    class_teacher: s.class_teacher ?? '',
    master: s.master ?? '',
  }
}

export interface TemplateContext {
  students: StudentSource[]
  educatorName: string
  yearName: string | null
  today?: Date
}

const common = (vals: (string | number | null | undefined)[]): string => {
  const set = new Set(vals.map((v) => (v == null ? '' : String(v))))
  return set.size === 1 ? [...set][0] : ''
}

export function buildTemplateData(ctx: TemplateContext): Record<string, unknown> {
  const rows = ctx.students.map((s, i) => {
    const f = buildStudentFields(s)
    return { ...f, index: String(i + 1), student: f }
  })
  return {
    date: formatDate(ctx.today ?? new Date()),
    year: ctx.yearName ?? '',
    educator: { full_name: ctx.educatorName },
    room: common(ctx.students.map((s) => s.room)),
    floor: common(ctx.students.map((s) => s.floor)),
    count: String(ctx.students.length),
    student: rows[0]?.student ?? buildStudentFields({ last_name: '', first_name: '', grade: null }),
    students: rows,
  }
}

/** Імена полів з тексту шаблону: «{{ student.full_name }}» → 'student.full_name'; маркери циклів скасовуються. */
export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1].replace(/^[#^/]\s*/, '').trim()
    if (name) found.add(name)
  }
  return [...found]
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export interface TemplateCheck {
  placeholders: string[]
  error: string | null
}

function describeError(e: unknown): string {
  const err = e as { message?: string; properties?: { errors?: { message?: string; properties?: { explanation?: string } }[] } }
  const sub = err.properties?.errors
    ?.map((x) => x.properties?.explanation ?? x.message)
    .filter(Boolean)
    .slice(0, 5)
  return sub && sub.length > 0 ? sub.join('; ') : (err.message ?? String(e))
}

async function loadZip(buf: ArrayBuffer | Uint8Array) {
  const { default: PizZip } = await import('pizzip')
  return new PizZip(buf)
}

type Scope = Record<string, unknown>

function lookup(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Scope)[k]
  }
  return cur
}

/** Підтримує крапкову нотацію (student.full_name) і пошук у батьківських областях (room усередині циклу). */
function dotParser(tag: string) {
  const path = tag.trim().split('.')
  return {
    get(scope: unknown, context?: { scopeList?: unknown[] }) {
      if (tag.trim() === '.') return scope
      const own = lookup(scope, path)
      if (own !== undefined) return own
      const list = context?.scopeList ?? []
      for (let i = list.length - 1; i >= 0; i--) {
        const v = lookup(list[i], path)
        if (v !== undefined) return v
      }
      return undefined
    },
  }
}

async function makeDocxtemplater(buf: ArrayBuffer | Uint8Array) {
  const [{ default: Docxtemplater }, zip] = await Promise.all([import('docxtemplater'), loadZip(buf)])
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    parser: dotParser,
    nullGetter: () => '',
  })
  return { doc, zip }
}

/** Перевіряє, що .docx — коректний шаблон, і збирає перелік полів. */
export async function checkTemplate(buf: ArrayBuffer | Uint8Array): Promise<TemplateCheck> {
  try {
    const { doc, zip } = await makeDocxtemplater(buf)
    void doc // конструктор уже розібрав і перевірив теги
    const text = Object.keys(zip.files)
      .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
      .map((n) => xmlToText(zip.files[n].asText()))
      .join('\n')
    return { placeholders: extractPlaceholders(text), error: null }
  } catch (e) {
    return { placeholders: [], error: describeError(e) }
  }
}

/** Підставляє дані у шаблон, повертає готовий .docx. */
export async function renderDocxTemplate(buf: ArrayBuffer | Uint8Array, data: Record<string, unknown>): Promise<Blob> {
  try {
    const { doc } = await makeDocxtemplater(buf)
    doc.render(data)
    return doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    })
  } catch (e) {
    throw new Error(describeError(e), { cause: e })
  }
}

/** Готовий до вставки у Word фрагмент для загального поля довідки. */
export function placeholderSnippet(key: string): string {
  if (key === 'students') return '{{#students}}…{{/students}}'
  if (key === 'student.*') return '{{student.full_name}}'
  return `{{${key}}}`
}

export function studentSnippet(key: string, mode: 'single' | 'row'): string {
  return mode === 'single' ? `{{student.${key}}}` : `{{${key}}}`
}

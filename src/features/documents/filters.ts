import type { AcademicYear, DocumentRow, FileType } from './types'
import { DOCX_MIME, PDF_MIME } from './types'

export type SortKey = 'created_desc' | 'created_asc' | 'title' | 'year_desc'

export const SORT_LABELS: Record<SortKey, string> = {
  created_desc: 'Спочатку нові',
  created_asc: 'Спочатку старі',
  title: 'За назвою (А–Я)',
  year_desc: 'За навчальним роком',
}

export interface DocumentFilters {
  search: string
  category: string
  topic: string
  yearId: string
  authorId: string
  tags: string[]
  fileType: '' | FileType
}

export const EMPTY_FILTERS: DocumentFilters = {
  search: '',
  category: '',
  topic: '',
  yearId: '',
  authorId: '',
  tags: [],
  fileType: '',
}

const norm = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('uk').trim()

export function fileTypeOf(doc: Pick<DocumentRow, 'mime_type' | 'storage_path'>): FileType {
  const ext = doc.storage_path.split('.').pop()?.toLowerCase()
  if (doc.mime_type === DOCX_MIME || ext === 'docx') return 'docx'
  if (doc.mime_type === PDF_MIME || ext === 'pdf') return 'pdf'
  return 'other'
}

export function hasActiveFilters(f: DocumentFilters): boolean {
  return (
    norm(f.search) !== '' ||
    !!f.category ||
    !!f.topic ||
    !!f.yearId ||
    !!f.authorId ||
    f.tags.length > 0 ||
    !!f.fileType
  )
}

export function filterDocuments(docs: DocumentRow[], f: DocumentFilters): DocumentRow[] {
  const q = norm(f.search)
  return docs.filter((d) => {
    if (q && !norm(d.title).includes(q)) return false
    if (f.category && d.category !== f.category) return false
    if (f.topic && d.topic !== f.topic) return false
    if (f.yearId && d.academic_year_id !== f.yearId) return false
    if (f.authorId && d.author_id !== f.authorId) return false
    if (f.fileType && fileTypeOf(d) !== f.fileType) return false
    // усі вибрані теги мають бути присутні (AND)
    if (f.tags.length > 0 && !f.tags.every((t) => d.tags.includes(t))) return false
    return true
  })
}

export function sortDocuments(
  docs: DocumentRow[],
  key: SortKey,
  years: AcademicYear[] = [],
): DocumentRow[] {
  const yearName = new Map(years.map((y) => [y.id, y.name]))
  const byCreatedDesc = (a: DocumentRow, b: DocumentRow) => b.created_at.localeCompare(a.created_at)
  const copy = [...docs]
  switch (key) {
    case 'created_asc':
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'uk') || byCreatedDesc(a, b))
    case 'year_desc':
      return copy.sort((a, b) => {
        const ya = yearName.get(a.academic_year_id ?? '') ?? ''
        const yb = yearName.get(b.academic_year_id ?? '') ?? ''
        return yb.localeCompare(ya) || byCreatedDesc(a, b)
      })
    default:
      return copy.sort(byCreatedDesc)
  }
}

export interface FilterOptions {
  categories: string[]
  topics: string[]
  tags: string[]
}

const uniqSorted = (xs: (string | null)[]) =>
  [...new Set(xs.filter((x): x is string => !!x && x.trim() !== ''))].sort((a, b) =>
    a.localeCompare(b, 'uk'),
  )

export function collectOptions(docs: DocumentRow[]): FilterOptions {
  return {
    categories: uniqSorted(docs.map((d) => d.category)),
    topics: uniqSorted(docs.map((d) => d.topic)),
    tags: uniqSorted(docs.flatMap((d) => d.tags)),
  }
}

/** "тег1, Тег2 ,, тег1" → ['тег1', 'Тег2'] */
export function parseTags(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(/[,;]/)) {
    const t = raw.trim()
    if (t && !seen.has(t.toLocaleLowerCase('uk'))) {
      seen.add(t.toLocaleLowerCase('uk'))
      out.push(t)
    }
  }
  return out
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024

/** Повертає текст помилки або null, якщо файл допустимий (.docx / .pdf до 25 МБ). */
export function validateUploadFile(file: { name: string; size: number }, allowed: FileType[] = ['docx', 'pdf']): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const type: FileType = ext === 'docx' ? 'docx' : ext === 'pdf' ? 'pdf' : 'other'
  if (['doc', 'rtf', 'odt', 'docm'].includes(ext ?? '') && allowed.includes('docx')) {
    return `Старий формат .${ext} не підтримується. Відкрийте файл у Word, оберіть «Файл → Зберегти як → Документ Word (.docx)» і завантажте знову.`
  }
  if (!allowed.includes(type)) {
    return `Дозволені файли: ${allowed.map((t) => '.' + t).join(', ')}`
  }
  if (file.size === 0) return 'Файл порожній'
  if (file.size > MAX_FILE_BYTES) return 'Файл більший за 25 МБ'
  return null
}

export function mimeForType(t: FileType): string {
  return t === 'docx' ? DOCX_MIME : t === 'pdf' ? PDF_MIME : 'application/octet-stream'
}

export function extensionOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : ''
}

/** Ключі в Storage — лише ASCII (кирилиця в ключі відхиляється), тому назва зберігається в таблиці. */
export function newStoragePath(folder: 'documents' | 'templates', ext: string, uuid: string): string {
  return `${folder}/${uuid}.${ext}`
}

/** Ім'я файлу для завантаження: з назви документа + розширення з шляху. */
export function downloadName(title: string, storagePath: string): string {
  const ext = extensionOf(storagePath)
  const base =
    title
      .replace(/[\\/:*?"<>|]+/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'document'
  return ext ? `${base}.${ext}` : base
}

import { describe, expect, it } from 'vitest'
import {
  collectOptions,
  downloadName,
  EMPTY_FILTERS,
  filterDocuments,
  hasActiveFilters,
  newStoragePath,
  parseTags,
  sortDocuments,
  validateUploadFile,
  fileTypeOf,
} from './filters'
import type { AcademicYear, DocumentRow } from './types'

const years: AcademicYear[] = [
  { id: 'y1', name: '2022/2023', is_current: false },
  { id: 'y2', name: '2024/2025', is_current: false },
  { id: 'y3', name: '2026/2027', is_current: true },
]

function doc(over: Partial<DocumentRow>): DocumentRow {
  return {
    id: 'd',
    title: 'Документ',
    category: null,
    topic: null,
    academic_year_id: null,
    author_id: null,
    tags: [],
    storage_path: 'documents/x.docx',
    mime_type: null,
    based_on_document_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...over,
  }
}

const docs = [
  doc({ id: '1', title: 'План виховної роботи', category: 'Плани', topic: 'Виховна робота', academic_year_id: 'y1', author_id: 'a1', tags: ['план', 'річний'], created_at: '2023-01-01T00:00:00Z' }),
  doc({ id: '2', title: 'Звіт про чергування', category: 'Звіти', topic: 'Чергування', academic_year_id: 'y2', author_id: 'a2', tags: ['звіт'], storage_path: 'documents/y.pdf', mime_type: 'application/pdf', created_at: '2025-01-01T00:00:00Z' }),
  doc({ id: '3', title: 'плани заходів', category: 'Плани', topic: 'Виховна робота', academic_year_id: 'y3', author_id: 'a1', tags: ['план'], created_at: '2026-09-01T00:00:00Z' }),
]

describe('filterDocuments', () => {
  it('без фільтрів повертає все', () => {
    expect(filterDocuments(docs, EMPTY_FILTERS)).toHaveLength(3)
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })
  it('пошук за назвою без урахування регістру', () => {
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, search: 'ПЛАН' }).map((d) => d.id)).toEqual(['1', '3'])
  })
  it('категорія, рік, автор, тип файлу', () => {
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, category: 'Звіти' }).map((d) => d.id)).toEqual(['2'])
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, yearId: 'y3' }).map((d) => d.id)).toEqual(['3'])
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, authorId: 'a1' }).map((d) => d.id)).toEqual(['1', '3'])
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, fileType: 'pdf' }).map((d) => d.id)).toEqual(['2'])
  })
  it('теги: потрібні всі вибрані', () => {
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, tags: ['план'] })).toHaveLength(2)
    expect(filterDocuments(docs, { ...EMPTY_FILTERS, tags: ['план', 'річний'] }).map((d) => d.id)).toEqual(['1'])
  })
  it('фільтри комбінуються', () => {
    const f = { ...EMPTY_FILTERS, topic: 'Виховна робота', authorId: 'a1', yearId: 'y1' }
    expect(filterDocuments(docs, f).map((d) => d.id)).toEqual(['1'])
    expect(hasActiveFilters(f)).toBe(true)
  })
})

describe('sortDocuments', () => {
  it('за датою, назвою і навчальним роком; не мутує вхід', () => {
    const input = [...docs]
    expect(sortDocuments(input, 'created_desc').map((d) => d.id)).toEqual(['3', '2', '1'])
    expect(sortDocuments(input, 'created_asc').map((d) => d.id)).toEqual(['1', '2', '3'])
    expect(sortDocuments(input, 'title').map((d) => d.id)).toEqual(['2', '1', '3'])
    expect(sortDocuments(input, 'year_desc', years).map((d) => d.id)).toEqual(['3', '2', '1'])
    expect(input.map((d) => d.id)).toEqual(['1', '2', '3'])
  })
})

describe('helpers', () => {
  it('collectOptions: унікальні відсортовані значення', () => {
    const o = collectOptions(docs)
    expect(o.categories).toEqual(['Звіти', 'Плани'])
    expect(o.tags).toEqual(['звіт', 'план', 'річний'])
  })
  it('parseTags прибирає порожні й дублікати', () => {
    expect(parseTags(' план, Річний ,, ПЛАН; звіт')).toEqual(['план', 'Річний', 'звіт'])
  })
  it('fileTypeOf', () => {
    expect(fileTypeOf(docs[0])).toBe('docx')
    expect(fileTypeOf(docs[1])).toBe('pdf')
    expect(fileTypeOf(doc({ storage_path: 'a.xls' }))).toBe('other')
  })
  it('validateUploadFile', () => {
    expect(validateUploadFile({ name: 'a.docx', size: 10 })).toBeNull()
    expect(validateUploadFile({ name: 'a.PDF', size: 10 })).toBeNull()
    expect(validateUploadFile({ name: 'a.doc', size: 10 })).toMatch(/Дозволені/)
    expect(validateUploadFile({ name: 'a.docx', size: 0 })).toMatch(/порожній/)
    expect(validateUploadFile({ name: 'a.docx', size: 26 * 1024 * 1024 })).toMatch(/25/)
    expect(validateUploadFile({ name: 'a.pdf', size: 10 }, ['docx'])).toMatch(/\.docx/)
  })
  it('шлях у Storage ASCII-безпечний, ім’я для завантаження — з назви', () => {
    expect(newStoragePath('documents', 'docx', 'u-1')).toBe('documents/u-1.docx')
    expect(downloadName('План: 2024/25?', 'documents/u.docx')).toBe('План 2024 25.docx')
    expect(downloadName('  ', 'documents/u.pdf')).toBe('document.pdf')
  })
})

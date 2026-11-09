import { describe, expect, it } from 'vitest'
import {
  basedOnReducer,
  candidatesForTopic,
  canCreate,
  defaultBasedOnTitle,
  INITIAL_BASED_ON,
} from './basedOn'
import type { AcademicYear, DocumentRow } from './types'

const years: AcademicYear[] = [
  { id: 'y1', name: '2022/2023', is_current: false },
  { id: 'y2', name: '2025/2026', is_current: false },
]
const d = (id: string, topic: string | null, year: string | null, created: string, category: string | null = 'Плани'): DocumentRow => ({
  id, title: id, category, topic, academic_year_id: year, author_id: null, tags: [],
  storage_path: `documents/${id}.docx`, mime_type: null, based_on_document_id: null, created_at: created, updated_at: created,
})

describe('candidatesForTopic', () => {
  const docs = [
    d('old', 'Виховна робота', 'y1', '2023-01-01'),
    d('new', 'Виховна робота', 'y2', '2025-10-01'),
    d('new2', 'Виховна робота', 'y2', '2025-11-01'),
    d('other', 'Чергування', 'y2', '2025-10-01'),
    d('cat', null, 'y2', '2025-10-01', 'Звіти'),
  ]
  it('фільтрує за темою, найновіший рік першим', () => {
    expect(candidatesForTopic(docs, { category: '', topic: 'Виховна робота' }, years).map((x) => x.id)).toEqual(['new2', 'new', 'old'])
  })
  it('без теми — за категорією', () => {
    expect(candidatesForTopic(docs, { category: 'Звіти', topic: '' }, years).map((x) => x.id)).toEqual(['cat'])
  })
  it('нічого не вибрано — порожній список', () => {
    expect(candidatesForTopic(docs, { category: '', topic: '' }, years)).toEqual([])
  })
})

describe('defaultBasedOnTitle', () => {
  it('замінює навчальний рік у кінці назви', () => {
    expect(defaultBasedOnTitle('План роботи 2023/2024', '2026/2027')).toBe('План роботи (2026/2027)')
    expect(defaultBasedOnTitle('План роботи (2023-2024)', '2026/2027')).toBe('План роботи (2026/2027)')
    expect(defaultBasedOnTitle('План роботи', '2026/2027')).toBe('План роботи (2026/2027)')
    expect(defaultBasedOnTitle('План роботи', null)).toBe('План роботи')
  })
})

describe('basedOnReducer', () => {
  it('повний шлях: тема → перегляд → підтвердження → готово', () => {
    let s = basedOnReducer(INITIAL_BASED_ON, { type: 'setTopic', category: 'Плани', topic: 'Виховна робота' })
    expect(s.step).toBe('pick')
    s = basedOnReducer(s, { type: 'openPreview', sourceId: 'doc1' })
    expect(s.step).toBe('preview')
    s = basedOnReducer(s, { type: 'accept', title: 'Новий' })
    expect(s).toMatchObject({ step: 'confirm', title: 'Новий', sourceId: 'doc1' })
    expect(canCreate(s)).toBe(true)
    s = basedOnReducer(s, { type: 'setTitle', title: '   ' })
    expect(canCreate(s)).toBe(false)
    s = basedOnReducer(s, { type: 'setTitle', title: 'Інша назва' })
    s = basedOnReducer(s, { type: 'created', documentId: 'new1' })
    expect(s).toMatchObject({ step: 'done', createdId: 'new1' })
    expect(basedOnReducer(s, { type: 'backToList' })).toBe(s)
    expect(basedOnReducer(s, { type: 'reset' })).toEqual(INITIAL_BASED_ON)
  })
  it('не можна підтвердити без перегляду; зміна теми скидає вибір', () => {
    expect(basedOnReducer(INITIAL_BASED_ON, { type: 'accept', title: 'x' })).toBe(INITIAL_BASED_ON)
    expect(basedOnReducer(INITIAL_BASED_ON, { type: 'created', documentId: 'x' })).toBe(INITIAL_BASED_ON)
    let s = basedOnReducer(INITIAL_BASED_ON, { type: 'openPreview', sourceId: 'a' })
    s = basedOnReducer(s, { type: 'backToList' })
    expect(s).toMatchObject({ step: 'pick', sourceId: null })
    s = basedOnReducer(basedOnReducer(s, { type: 'openPreview', sourceId: 'a' }), { type: 'setTopic', category: '', topic: 'Т' })
    expect(s).toMatchObject({ step: 'pick', sourceId: null, topic: 'Т' })
  })
})

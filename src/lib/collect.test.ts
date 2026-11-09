import { describe, expect, it } from 'vitest'
import {
  activeLinkForFloor, campaignSince, filledStudentIds, linkState, normName, notFilledByFloor, shareMessage, suggestCandidates, unmatchedReason, ANSWER_FIELDS,
  type IntakeLink,
} from './collect'
import type { StudentRow } from './studentsList'

const NOW = new Date('2026-11-09T12:00:00Z')
const link = (o: Partial<IntakeLink>): IntakeLink => ({
  id: 'l', floor: 3, expires_at: '2026-11-16T12:00:00Z', revoked_at: null, created_at: '2026-11-09T10:00:00Z', max_submissions: 500, ...o,
})
const st = (o: Partial<StudentRow>): StudentRow => ({
  id: 'x', last_name: 'Іваненко', first_name: 'Іван', patronymic: 'Іванович', birth_date: '2009-01-01', grade: 10, status: 'active',
  room: null, floor: null, student_phone: null, mother_phone: null, father_phone: null, guardian_phone: null, ...o,
})

describe('intake links', () => {
  it('стан посилання: діє / прострочено / скасовано', () => {
    expect(linkState(link({}), NOW)).toBe('active')
    expect(linkState(link({ expires_at: '2026-11-09T11:00:00Z' }), NOW)).toBe('expired')
    expect(linkState(link({ revoked_at: '2026-11-09T11:00:00Z' }), NOW)).toBe('revoked')
  })
  it('діюче посилання поверху — одне; скасовані й прострочені не рахуються', () => {
    const links = [
      link({ id: 'old', floor: 3, revoked_at: '2026-11-09T11:00:00Z' }),
      link({ id: 'new', floor: 3 }),
      link({ id: 'f4', floor: 4, expires_at: '2026-11-01T00:00:00Z' }),
    ]
    expect(activeLinkForFloor(links, 3, NOW)?.id).toBe('new')
    expect(activeLinkForFloor(links, 4, NOW)).toBeNull()
    expect(activeLinkForFloor(links, 2, NOW)).toBeNull()
  })
  it('текст для чату містить посилання і дату', () => {
    const m = shareMessage('https://x.ua/#/form/abc', '2026-11-16T12:00:00Z')
    expect(m).toContain('https://x.ua/#/form/abc')
    expect(m).toMatch(/16\.11/)
  })
})

describe('normName / suggestCandidates', () => {
  it('нормалізація як у базі: регістр, апострофи, пробіли', () => {
    expect(normName("  Дем’ЯН   Олег ")).toBe('демян олег')
    expect(normName('Дем`ян')).toBe('демян')
  })
  const students = [
    st({ id: 'a', last_name: 'Воробйова', first_name: 'Ангеліна', patronymic: 'Василівна', birth_date: '2008-07-31' }),
    st({ id: 'b', last_name: 'Воробйов', first_name: 'Василь', patronymic: 'Петрович', birth_date: '2005-01-01' }),
    st({ id: 'c', last_name: 'Петренко', first_name: 'Ангеліна', patronymic: null, birth_date: '2008-07-31' }),
    st({ id: 'd', last_name: 'Інший', first_name: 'Зовсім', patronymic: null, birth_date: '2000-01-01' }),
    st({ id: 'e', last_name: 'Воробйова', first_name: 'Ангеліна', patronymic: 'Василівна', birth_date: '2008-07-31', status: 'left' }),
  ]
  it('підказує схожих: помилка в написанні, той самий день народження; неактивних і незв’язаних не показує', () => {
    const ids = suggestCandidates({ name: 'Воробьова Ангеліна', birth_date: '2008-07-31' }, students).map((s) => s.id)
    expect(ids[0]).toBe('a')
    expect(ids).toContain('c')
    expect(ids).not.toContain('d')
    expect(ids).not.toContain('e')
  })
  it('без збігів — порожньо', () => {
    expect(suggestCandidates({ name: 'Ніхто Нікчемний', birth_date: '1999-09-09' }, students)).toEqual([])
  })
})

describe('progress', () => {
  it('початок збору — найраніше посилання за останні 30 днів', () => {
    expect(campaignSince([link({ created_at: '2026-11-05T00:00:00Z' }), link({ created_at: '2026-11-08T00:00:00Z' })], NOW)?.toISOString()).toBe('2026-11-05T00:00:00.000Z')
    expect(campaignSince([link({ created_at: '2026-01-01T00:00:00Z' })], NOW)).toBeNull()
    expect(campaignSince([], NOW)).toBeNull()
  })
  it('«заповнив» = подана після початку збору версія, окрім відхиленої', () => {
    const since = new Date('2026-11-05T00:00:00Z')
    const ids = filledStudentIds([
      { student_id: 'a', status: 'pending', submitted_at: '2026-11-08T00:00:00Z' },
      { student_id: 'b', status: 'approved', submitted_at: '2026-09-01T00:00:00Z' }, // стара
      { student_id: 'c', status: 'rejected', submitted_at: '2026-11-08T00:00:00Z' }, // відхилена
    ], since)
    expect([...ids]).toEqual(['a'])
    expect(filledStudentIds([{ student_id: 'b', status: 'approved', submitted_at: '2026-09-01T00:00:00Z' }], null).has('b')).toBe(true)
  })
  it('«не заповнили» групуються за поверхом, нерозподілені окремо, неактивні не рахуються', () => {
    const rows = [
      st({ id: '1', last_name: 'Бойко', room: '305', floor: 3 }),
      st({ id: '2', last_name: 'Аніщенко', room: '302', floor: 3 }),
      st({ id: '3', last_name: 'Гнатюк', room: '210', floor: 2 }),
      st({ id: '4', last_name: 'Власенко' }),
      st({ id: '5', last_name: 'Вибув', status: 'left', room: '401', floor: 4 }),
      st({ id: '6', last_name: 'Заповнив', room: '501', floor: 5 }),
    ]
    const g = notFilledByFloor(rows, new Set(['6']))
    expect(g.map((x) => x.key)).toEqual(['2', '3', 'none'])
    expect(g[1].students.map((s) => s.id)).toEqual(['2', '1']) // за алфавітом
  })
})

describe('unmatchedReason / ANSWER_FIELDS', () => {
  const base = [
    st({ id: 'a', last_name: 'Воробйова', first_name: 'Ангеліна', patronymic: 'Василівна', birth_date: '2008-07-31' }),
    st({ id: 'g', last_name: 'Випускник', first_name: 'Петро', patronymic: null, birth_date: '2007-05-05', status: 'graduated' }),
    st({ id: 'd1', last_name: 'Дубль', first_name: 'Дубль', patronymic: null, birth_date: '2009-01-01' }),
    st({ id: 'd2', last_name: 'Дубль', first_name: 'Дубль', patronymic: null, birth_date: '2009-01-01' }),
    st({ id: 'n', last_name: 'Безнародження', first_name: 'Іван', patronymic: null, birth_date: null }),
  ]
  const why = (name: string, d: string) => unmatchedReason({ name, birth_date: d }, base)
  it('пояснює причину', () => {
    expect(why('Воробйова Ангеліна Василівна', '2008-07-30')).toMatch(/дата народження інша \(у базі: 2008-07-31\)/)
    expect(why('Воробйова Ангеліна', '2008-07-31')).toMatch(/ПІБ відрізняється/)
    expect(why('Дубль Дубль', '2009-01-01')).toMatch(/кілька учнів/)
    expect(why('Випускник Петро', '2007-05-05')).toMatch(/не активний/)
    expect(why('Безнародження Іван', '2010-02-02')).toMatch(/не вказана/)
    expect(why('Хтось Інший', '1999-09-09')).toMatch(/немає в базі/)
    expect(why('Воробйова Ангеліна Василівна', '2008-07-31')).toMatch(/забагато необроблених/)
  })
  it('повна анкета містить усі поля, медичні позначені', () => {
    const keys = ANSWER_FIELDS.map((f) => f.key)
    for (const k of ['full_name', 'birth_date', 'mother_phone', 'guardian_relation', 'social_status', 'allergies']) expect(keys).toContain(k)
    expect(ANSWER_FIELDS.filter((f) => f.medical).map((f) => f.key)).toEqual(['allergies', 'chronic_conditions'])
  })
})

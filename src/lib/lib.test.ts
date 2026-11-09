import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'
import { changedCount, diffRecords, PROFILE_FIELDS, withStudentIdentity } from './diff'
import { errorMessage, telHref } from './format'
import { buildFormLink, isLinkActive } from './links'
import {
  filterStudents, DEFAULT_FILTERS, sortStudents, studentsToCsv, type StudentRow,
} from './studentsList'

const row = (o: Partial<StudentRow>): StudentRow => ({
  id: 'x', last_name: 'Іваненко', first_name: 'Іван', patronymic: null, birth_date: null, grade: 10, status: 'active',
  room: null, floor: null, student_phone: null, mother_phone: null, father_phone: null, guardian_phone: null, ...o,
})

describe('diffRecords', () => {
  it('підсвічує лише змінені поля, ігноруючи пробіли та null/«»', () => {
    const before = { group_number: 'К-21', profession: 'Кухар', address: null, master: ' Петренко  П. ' }
    const after = { group_number: 'К-22', profession: 'Кухар', address: '', master: 'Петренко П.' }
    const d = diffRecords(before, after, PROFILE_FIELDS)
    expect(d.filter((x) => x.changed).map((x) => x.key)).toEqual(['group_number'])
    expect(changedCount(d)).toBe(1)
  })
  it('без попередньої версії все заповнене — зміна', () => {
    const d = diffRecords(null, { profession: 'Кухар' }, PROFILE_FIELDS)
    expect(d.find((x) => x.key === 'profession')).toMatchObject({ before: '', after: 'Кухар', changed: true })
  })
  it('повторне подання: різниця між двома версіями показує виправлення помилки', () => {
    const v1 = { group_number: 'К-21', profession: 'Кухр', mother_phone: '+380501234567' }
    const v2 = { group_number: 'К-21', profession: 'Кухар', mother_phone: '+380501234567' }
    const d = diffRecords(v1, v2, PROFILE_FIELDS).filter((x) => x.changed)
    expect(d).toEqual([expect.objectContaining({ key: 'profession', before: 'Кухр', after: 'Кухар' })])
    expect(changedCount(diffRecords(v2, { ...v2 }, PROFILE_FIELDS))).toBe(0)
  })
  it('withStudentIdentity підставляє ПІБ і дату з картки', () => {
    const p = withStudentIdentity({ group_number: 'A' }, { last_name: 'І', first_name: 'П', patronymic: 'Б', birth_date: '2010-01-01' })
    expect(p).toMatchObject({ submitted_full_name: 'І П Б', submitted_birth_date: '2010-01-01' })
    expect(withStudentIdentity(null, { last_name: 'І', first_name: 'П', patronymic: null, birth_date: null })).toBeNull()
  })
})

describe('csv', () => {
  it('екранує лапки, роздільники, переноси', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('він сказав "ок"')).toBe('"він сказав ""ок"""')
    expect(csvCell('1\n2')).toBe('"1\n2"')
    expect(csvCell(null)).toBe('')
  })
  it('захищає від формул, але не ламає телефони', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('-1+1')).toBe("'-1+1")
    expect(csvCell('+380671234567')).toBe('+380671234567')
  })
  it('toCsv додає BOM і CRLF', () => {
    const s = toCsv(['a', 'b'], [[1, 'x']])
    expect(s.startsWith('﻿')).toBe(true)
    expect(s).toBe('﻿a;b\r\n1;x\r\n')
  })
})

describe('students list', () => {
  const rows = [
    row({ id: '1', last_name: 'Бойко', first_name: 'Олег', grade: 9, room: '305', floor: 3, student_phone: '+380671112233', mother_phone: '+380501234567' }),
    row({ id: '2', last_name: 'Андрієнко', first_name: 'Марія', grade: 11, room: '210', floor: 2 }),
    row({ id: '3', last_name: 'Власенко', first_name: 'Ігор', grade: 10 }),
    row({ id: '4', last_name: 'Гнатюк', first_name: 'Ія', grade: 10, status: 'left', room: '305', floor: 3 }),
  ]
  const f = (o: Partial<typeof DEFAULT_FILTERS>) => filterStudents(rows, { ...DEFAULT_FILTERS, status: '', ...o }).map((r) => r.id)

  it('пошук за ПІБ, телефоном (будь-який формат) і кімнатою', () => {
    expect(f({ query: 'бойко олег' })).toEqual(['1'])
    expect(f({ query: '067 111' })).toEqual(['1'])
    expect(f({ query: '+38050123' })).toEqual(['1'])
    expect(f({ query: '305' })).toEqual(['1', '4'])
  })
  it('фільтри: клас, поверх, кімната, статус, нерозподілені', () => {
    expect(f({ grade: '10' })).toEqual(['3', '4'])
    expect(f({ floor: '2' })).toEqual(['2'])
    expect(f({ room: '305' })).toEqual(['1', '4'])
    expect(f({ status: 'left' })).toEqual(['4'])
    expect(f({ unplacedOnly: true })).toEqual(['3'])
    expect(filterStudents(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual(['1', '2', '3'])
  })
  it('сортування: за ПІБ, клас; нерозподілені в кінці за кімнатою в обох напрямках', () => {
    expect(sortStudents(rows, 'name', 'asc').map((r) => r.id)).toEqual(['2', '1', '3', '4'])
    expect(sortStudents(rows, 'grade', 'desc').map((r) => r.id)[0]).toBe('2')
    expect(sortStudents(rows, 'room', 'asc').map((r) => r.id)).toEqual(['2', '1', '4', '3'])
    expect(sortStudents(rows, 'room', 'desc').map((r) => r.id).at(-1)).toBe('3')
  })
  it('експорт CSV: заголовок, рядки, без медичних даних', () => {
    const csv = studentsToCsv(sortStudents(rows, 'name', 'asc').slice(0, 2))
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('ПІБ;Клас;Статус;Поверх;Кімната;Телефон учня;Мама;Тато;Опікун')
    expect(lines[2]).toBe('Бойко Олег;9;Активний;3;305;+380671112233;+380501234567;;')
    expect(csv.toLowerCase()).not.toContain('алерг')
  })
})

describe('format / links', () => {
  it('telHref нормалізує та відсіює недозвонювані значення', () => {
    expect(telHref('067 123 45 67')).toBe('tel:+380671234567')
    expect(telHref('+380671234567')).toBe('tel:+380671234567')
    expect(telHref('0 44 123 45 67 89')).toBe('tel:0441234567' + '89')
    expect(telHref('нема')).toBeNull()
    expect(telHref(null)).toBeNull()
  })
  it('errorMessage розпізнає коди БД', () => {
    expect(errorMessage({ message: 'NOT_PENDING: version is already approved' })).toBe('Цю версію вже оброблено.')
    expect(errorMessage({ message: 'permission denied for table x' })).toBe('Недостатньо прав для цієї дії.')
  })
  it('buildFormLink та isLinkActive', () => {
    expect(buildFormLink('abc')).toBe('https://kovalchuk-design.github.io/dormitory-app/#/form/abc')
    expect(buildFormLink('abc', 'http://localhost:5173/dormitory-app')).toBe('http://localhost:5173/dormitory-app/#/form/abc')
    const now = new Date('2026-11-09T00:00:00Z')
    expect(isLinkActive({ used_at: null, expires_at: '2026-11-10T00:00:00Z' }, now)).toBe(true)
    expect(isLinkActive({ used_at: null, expires_at: '2026-11-08T00:00:00Z' }, now)).toBe(false)
    expect(isLinkActive({ used_at: '2026-11-08T00:00:00Z', expires_at: '2026-11-10T00:00:00Z' }, now)).toBe(false)
  })
})

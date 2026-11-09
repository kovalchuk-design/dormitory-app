import { describe, expect, it } from 'vitest'
import { isIsoDate, isValidPhone, normalizePhone, validateQuestionnaire } from './questionnaire.ts'

const TODAY = new Date('2026-11-09T12:00:00Z')
const valid = {
  full_name: 'Тестенко Тест Тестович', birth_date: '2010-05-17', room: '305', group_number: 'К-21',
  profession: 'Кухар', class_teacher: 'Іваненко І.І.', master: 'Петренко П.П.', address: 'м. Тест, вул. Тестова 1',
  student_phone: '067 123 45 67', mother_name: 'Тестенко Мама', mother_phone: '+380501234567',
  consent: true,
}

describe('normalizePhone / isValidPhone', () => {
  it.each([
    ['+380671234567', '+380671234567'],
    ['380671234567', '+380671234567'],
    ['0671234567', '+380671234567'],
    ['(067) 123-45-67', '+380671234567'],
    ['+38 067 123 45 67', '+380671234567'],
  ])('%s → %s', (raw, out) => expect(normalizePhone(raw)).toBe(out))

  it.each(['', '123', '+48123456789', '+38067123456', '+3806712345678', 'abc', '067123456a', '+380 67 12'])(
    'відхиляє %j', (raw) => expect(isValidPhone(raw)).toBe(false))
})

describe('isIsoDate', () => {
  it('перевіряє реальні дати', () => {
    expect(isIsoDate('2010-02-28')).toBe(true)
    expect(isIsoDate('2010-02-30')).toBe(false)
    expect(isIsoDate('10.02.2010')).toBe(false)
  })
})

describe('validateQuestionnaire', () => {
  it('приймає коректні дані і нормалізує телефони', () => {
    const r = validateQuestionnaire(valid, TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.student_phone).toBe('+380671234567')
      expect(r.value.father_phone).toBe('')
    }
  })

  it('вимагає обовʼязкові поля та згоду', () => {
    const r = validateQuestionnaire({}, TODAY)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      for (const k of ['full_name', 'birth_date', 'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone', 'consent'] as const)
        expect(r.errors[k], k).toBeTruthy()
    }
  })

  it('без згоди — помилка', () => {
    const r = validateQuestionnaire({ ...valid, consent: false }, TODAY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['consent'])
  })

  it('згода лише як булеве true (рядок «true» не годиться)', () => {
    expect(validateQuestionnaire({ ...valid, consent: 'true' }, TODAY).ok).toBe(false)
  })

  it('некоректний телефон учня', () => {
    const r = validateQuestionnaire({ ...valid, student_phone: '12345' }, TODAY)
    expect(!r.ok && r.errors.student_phone).toBeTruthy()
  })

  it('ПІБ з одного слова — помилка', () => {
    const r = validateQuestionnaire({ ...valid, full_name: 'Тест' }, TODAY)
    expect(!r.ok && r.errors.full_name).toBeTruthy()
  })

  it('дата у майбутньому / надто давня', () => {
    expect(validateQuestionnaire({ ...valid, birth_date: '2030-01-01' }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, birth_date: '1980-01-01' }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, birth_date: '2010-13-45' }, TODAY).ok).toBe(false)
  })

  it('потрібен хоча б один контакт батьків/опікуна; імʼя і телефон — парою', () => {
    expect(validateQuestionnaire({ ...valid, mother_name: '', mother_phone: '' }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, mother_name: '', mother_phone: '', guardian_name: 'Опікун О.', guardian_phone: '0991112233' }, TODAY).ok).toBe(true)
    const r = validateQuestionnaire({ ...valid, father_name: 'Тато Т.' }, TODAY)
    expect(!r.ok && r.errors.father_phone).toBeTruthy()
  })

  it('обмеження довжини та керівні символи', () => {
    expect(validateQuestionnaire({ ...valid, address: 'a'.repeat(301) }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, profession: 'x\u0000y' }, TODAY).ok).toBe(false)
  })

  it('нерядкові значення відхиляються, зайві ключі відкидаються', () => {
    expect(validateQuestionnaire({ ...valid, master: 5 }, TODAY).ok).toBe(false)
    const r = validateQuestionnaire({ ...valid, evil: 'x', status: 'approved' }, TODAY)
    expect(r.ok && 'evil' in r.value).toBe(false)
    expect(validateQuestionnaire(null, TODAY).ok).toBe(false)
  })
})

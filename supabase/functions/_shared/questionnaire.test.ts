import { describe, expect, it } from 'vitest'
import { isIsoDate, isValidPhone, normalizePhone, validateQuestionnaire } from './questionnaire.ts'

const TODAY = new Date('2026-11-09T12:00:00Z')
const valid = {
  full_name: 'Тестенко Тест Тестович', birth_date: '2010-05-17', room: '305', group_number: 'К-21',
  profession: 'Кухар', class_teacher: 'Іваненко І.І.', master: 'Петренко П.П.', address: 'м. Тест, вул. Тестова 1',
  student_phone: '067 123 45 67', mother_name: 'Тестенко Мама', mother_phone: '+380501234567',
  father_name: 'Тестенко Тато', father_phone: '0991112233',
  school_activities: 'Футбол', college_plans: 'Кулінарія', social_codes: ['none'],
  allergies: 'немає', chronic_conditions: 'немає', consent: true,
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
      expect(r.value.father_phone).toBe('+380991112233')
      expect(r.value.guardian_phone).toBe('')
    }
  })

  it('вимагає обовʼязкові поля та згоду', () => {
    const r = validateQuestionnaire({}, TODAY)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      for (const k of ['full_name', 'birth_date', 'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone', 'mother_name', 'father_name', 'school_activities', 'college_plans', 'social_codes', 'allergies', 'chronic_conditions', 'consent'] as const)
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

  it('мама й тато обовʼязкові: або ПІБ + телефон, або «немає»', () => {
    expect(validateQuestionnaire(valid, TODAY).ok).toBe(true)
    expect(validateQuestionnaire({ ...valid, mother_name: '', mother_phone: '' }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, father_name: '' }, TODAY).ok).toBe(false)
    const noPhone = validateQuestionnaire({ ...valid, father_phone: '' }, TODAY)
    expect(!noPhone.ok && noPhone.errors.father_phone).toBeTruthy()
  })

  it('одного з батьків немає: «немає» без телефону проходить і нормалізується', () => {
    for (const word of ['немає', 'Нема', ' НЕМАЄ ', '-']) {
      const r = validateQuestionnaire({ ...valid, father_name: word, father_phone: '' }, TODAY)
      expect(r.ok, word).toBe(true)
      if (r.ok) expect(r.value).toMatchObject({ father_name: 'немає', father_phone: '' })
    }
    const r = validateQuestionnaire({ ...valid, father_name: 'немає', father_phone: 'немає' }, TODAY)
    expect(r.ok && r.value.father_phone).toBe('')
    expect(validateQuestionnaire({ ...valid, father_name: 'немає', father_phone: '0991112233' }, TODAY).ok).toBe(false)
  })

  it('сирота: обидвох батьків немає → потрібен опікун з телефоном', () => {
    const orphan = { ...valid, mother_name: 'немає', mother_phone: '', father_name: 'немає', father_phone: '' }
    const r = validateQuestionnaire(orphan, TODAY)
    expect(!r.ok && r.errors.guardian_name).toBeTruthy()
    expect(validateQuestionnaire({ ...orphan, guardian_name: 'Опікун О.', guardian_phone: '0991112233', guardian_relation: 'тітка' }, TODAY).ok).toBe(true)
  })

  it('опікун необовʼязковий, але ПІБ і телефон — парою', () => {
    const r = validateQuestionnaire({ ...valid, guardian_name: 'Опікун О.' }, TODAY)
    expect(!r.ok && r.errors.guardian_phone && r.errors.guardian_relation).toBeTruthy()
    expect(validateQuestionnaire({ ...valid, guardian_phone: '0991112233' }, TODAY).ok).toBe(false)
    const ok = validateQuestionnaire({ ...valid, guardian_name: 'Опікун О.', guardian_phone: '0991112233', guardian_relation: 'бабуся' }, TODAY)
    expect(ok.ok && ok.value.guardian_relation).toBe('бабуся')
  })

  it('соціальний статус: чекліст як у паперовій анкеті', () => {
    expect(validateQuestionnaire({ ...valid, social_codes: [] }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, social_codes: ['bogus'] }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, social_codes: 'orphan' }, TODAY).ok).toBe(false)
    expect(validateQuestionnaire({ ...valid, social_codes: ['none', 'vpo'] }, TODAY).ok).toBe(false)
    // «Багатодітна» і «Служба в ЗСУ» потребують деталей
    const noDetail = validateQuestionnaire({ ...valid, social_codes: ['large_family', 'zsu'] }, TODAY)
    expect(!noDetail.ok && noDetail.errors.social_children && noDetail.errors.social_zsu).toBeTruthy()
    // як у зразку: багатодітна (3 дітей) + служба в ЗСУ (тато)
    const r = validateQuestionnaire({
      ...valid, social_codes: ['zsu', 'large_family'], social_children: '3', social_zsu: 'Воробйов Василь - тато',
      social_ato: 'ігнорується', social_status: 'підроблений текст',
    }, TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.social_codes).toEqual(['large_family', 'zsu'])
      expect(r.value.social_ato).toBe('')
      expect(r.value.social_status).toBe("Багатодітна сім'я (неповнолітніх дітей: 3); Служба в ЗСУ (Воробйов Василь - тато)")
    }
    expect(validateQuestionnaire({ ...valid, social_codes: ['large_family'], social_children: 'три' }, TODAY).ok).toBe(false)
    const none = validateQuestionnaire({ ...valid, social_codes: ['none'] }, TODAY)
    expect(none.ok && none.value.social_status).toBe('Жодного з переліку')
  })

  it('довга професія з паперового бланка влізає', () => {
    const profession = 'Автослюсар з ремонту транспортних засобів, водій автотранспортних засобів категорії В'
    expect(validateQuestionnaire({ ...valid, profession }, TODAY).ok).toBe(true)
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

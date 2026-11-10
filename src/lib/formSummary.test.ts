import { describe, expect, it } from 'vitest'
import { EMPTY_QUESTIONNAIRE, validateQuestionnaire, type QuestionnaireData } from '../../supabase/functions/_shared/questionnaire.ts'
import { applyContactMode } from './contactMode'
import { buildSummary, formatLongDate, formatPhoneDisplay } from './formSummary'

const base: QuestionnaireData = {
  ...EMPTY_QUESTIONNAIRE, full_name: 'Воробйова Ангеліна Василівна', birth_date: '2008-07-31', group_number: '7',
  profession: 'Автослюсар', class_teacher: 'Савчук С.А.', master: 'Савчук С.А.', address: 'Рівненська обл.', student_phone: '0985504113',
  mother_name: 'немає', father_name: 'Воробйов Василь', father_phone: '0687763053', school_activities: 'Волейбол', college_plans: 'Волейбол',
  social_codes: ['large_family', 'zsu'], social_children: '3', social_zsu: 'тато', consent: true,
}
const validated = (v: QuestionnaireData, mode: 'parents' | 'guardian') => {
  const r = validateQuestionnaire(applyContactMode(v, mode), new Date('2026-11-10T12:00:00Z'))
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.value
}
const find = (s: ReturnType<typeof buildSummary>, id: string, key: string) => s.find((x) => x.id === id)!.items.find((i) => i.key === key)!

describe('форматування', () => {
  it('довга дата та телефон', () => {
    expect(formatLongDate('2008-07-31')).toBe('31 липня 2008')
    expect(formatLongDate('2010-03-05')).toBe('5 березня 2010')
    expect(formatPhoneDisplay('+380985504113')).toBe('+380 98 550 41 13')
    expect(formatPhoneDisplay('12345')).toBe('12345')
  })
})

describe('buildSummary', () => {
  it('режим «Батьки»: «немає» без телефону, телефон тата у читабельному вигляді, ПІБ і дата виділені', () => {
    const s = buildSummary(validated(base, 'parents'), 'parents')
    expect(s.map((x) => x.id)).toEqual(['sec-about', 'sec-contacts', 'sec-interests', 'sec-social', 'sec-health'])
    expect(find(s, 'sec-contacts', 'mother').value).toBe('немає')
    expect(find(s, 'sec-contacts', 'father').value).toBe('Воробйов Василь, +380 68 776 30 53')
    expect(find(s, 'sec-about', 'full_name').emphasis).toBe(true)
    expect(find(s, 'sec-about', 'birth_date')).toMatchObject({ value: '31 липня 2008', emphasis: true })
    expect(find(s, 'sec-about', 'student_phone').value).toBe('+380 98 550 41 13')
    expect(find(s, 'sec-social', 'social_status').value).toContain('Багатодітна сім')
    expect(s.find((x) => x.id === 'sec-contacts')!.title).toBe('Батьки')
  })
  it('режим «Опікун»: один рядок з «ким доводиться»', () => {
    const v = validated({ ...base, guardian_name: 'Бабка Інна Павлівна', guardian_relation: 'бабуся', guardian_phone: '0969410975' }, 'guardian')
    const s = buildSummary(v, 'guardian')
    expect(s.find((x) => x.id === 'sec-contacts')!.title).toBe('Опікун')
    expect(find(s, 'sec-contacts', 'guardian').value).toBe('Бабка Інна Павлівна (бабуся), +380 96 941 09 75')
    expect(s.find((x) => x.id === 'sec-contacts')!.items).toHaveLength(1)
  })
  it('необовʼязкові медичні поля: порожні позначаються «не вказано», кімната показується лише якщо є', () => {
    const s = buildSummary(validated(base, 'parents'), 'parents')
    expect(find(s, 'sec-health', 'allergies')).toMatchObject({ value: 'не вказано', empty: true })
    expect(s[0].items.some((i) => i.key === 'room')).toBe(false)
    const s2 = buildSummary(validated({ ...base, room: '213', allergies: 'пилок' }, 'parents'), 'parents')
    expect(find(s2, 'sec-about', 'room').value).toBe('213')
    expect(find(s2, 'sec-health', 'allergies')).toMatchObject({ value: 'пилок' })
  })
})

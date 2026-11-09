import { describe, expect, it } from 'vitest'
import { EMPTY_QUESTIONNAIRE, validateQuestionnaire, type QuestionnaireData } from '../../supabase/functions/_shared/questionnaire.ts'
import { applyContactMode, detectContactMode, remapContactErrors } from './contactMode'

const TODAY = new Date('2026-11-09T12:00:00Z')
const base: QuestionnaireData = {
  ...EMPTY_QUESTIONNAIRE, full_name: 'Тестенко Тест Тестович', birth_date: '2010-05-17', group_number: '7', profession: 'Кухар',
  class_teacher: 'С', master: 'С', address: 'а', student_phone: '0671234567', school_activities: 'в', college_plans: 'в',
  social_codes: ['none'], allergies: 'немає', chronic_conditions: 'немає', consent: true,
}

describe('перемикач «Батьки / Опікун»', () => {
  it('«Батьки»: мама й тато заповнені, дані опікуна відкидаються', () => {
    const v = applyContactMode({ ...base, mother_name: 'Мама М', mother_phone: '0501234567', father_name: 'Тато Т', father_phone: '0991112233',
      guardian_name: 'Бабка', guardian_phone: '0961112233', guardian_relation: 'бабуся' }, 'parents')
    expect(v).toMatchObject({ guardian_name: '', guardian_phone: '', guardian_relation: '' })
    const r = validateQuestionnaire(v, TODAY)
    expect(r.ok).toBe(true)
  })
  it('«Опікун»: батьки стають «немає», потрібні ПІБ + ким доводиться + телефон опікуна', () => {
    const typed = { ...base, mother_name: 'Мама М', mother_phone: '0501234567', father_name: 'Тато Т', father_phone: '0991112233' }
    const noGuardian = validateQuestionnaire(applyContactMode(typed, 'guardian'), TODAY)
    expect(noGuardian.ok).toBe(false)
    const ok = validateQuestionnaire(applyContactMode({ ...typed, guardian_name: 'Бабка Інна', guardian_phone: '0969410975', guardian_relation: 'бабуся' }, 'guardian'), TODAY)
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value).toMatchObject({ mother_name: 'немає', mother_phone: '', father_name: 'немає', father_phone: '', guardian_relation: 'бабуся' })
  })
  it('режим за попередніми даними', () => {
    expect(detectContactMode({ mother_name: 'немає', father_name: 'немає', guardian_name: 'Бабка' })).toBe('guardian')
    expect(detectContactMode({ mother_name: 'Мама', father_name: 'немає', guardian_name: 'Бабка' })).toBe('parents')
    expect(detectContactMode({})).toBe('parents')
  })
  it('у режимі «Батьки» помилка про опікуна показується біля батьків із підказкою про перемикач', () => {
    const both = validateQuestionnaire(applyContactMode({ ...base, mother_name: 'немає', father_name: 'немає' }, 'parents'), TODAY)
    expect(!both.ok && both.errors.guardian_name).toBeTruthy()
    const mapped = remapContactErrors(both.ok ? {} : both.errors, 'parents')
    expect(mapped.guardian_name).toBeUndefined()
    expect(mapped.mother_name).toMatch(/Опікун/)
    expect(remapContactErrors({ guardian_name: 'x' }, 'guardian')).toEqual({ guardian_name: 'x' })
    expect(remapContactErrors({ guardian_name: 'Якщо батьків немає — вкажіть опікуна' }, 'guardian')).toEqual({ guardian_name: "Обов'язкове поле" })
  })
})

import { describe, expect, it } from 'vitest'
import { buildPlan, choiceKind, defaultChoice, mergedValue, mergeSocialData, MERGEABLE, toggleChoice } from './mergeChoice'
import type { FieldDiff } from './diff'

const row = (key: string, before: string, after: string, changed = before !== after): FieldDiff => ({ key, label: key, before, after, changed })

describe('defaultChoice', () => {
  it('за замовчуванням нове; нове порожнє, а старе є — старе', () => {
    expect(defaultChoice('8', '7')).toEqual({ old: false, new: true })
    expect(defaultChoice('Батько зник безвісти', '')).toEqual({ old: true, new: false })
    expect(defaultChoice('', 'Нове')).toEqual({ old: false, new: true })
    expect(defaultChoice('  ', '')).toEqual({ old: false, new: true })
  })
})

describe('toggleChoice', () => {
  it('текстове поле: можна обидва, але завжди лишається хоча б одне', () => {
    let c = defaultChoice('Батько зник безвісти', 'Служба в ЗСУ')
    c = toggleChoice(c, 'old', true)
    expect(c).toEqual({ old: true, new: true })
    c = toggleChoice(c, 'new', true)
    expect(c).toEqual({ old: true, new: false })
    expect(toggleChoice(c, 'old', true)).toEqual({ old: true, new: false }) // останню не вимкнути
  })
  it('телефон та подібні: лише одне значення (галочки взаємовиключні)', () => {
    expect(toggleChoice({ old: false, new: true }, 'old', false)).toEqual({ old: true, new: false })
    expect(toggleChoice({ old: true, new: false }, 'new', false)).toEqual({ old: false, new: true })
    expect(MERGEABLE.has('social_status')).toBe(true)
    expect(MERGEABLE.has('student_phone')).toBe(false)
  })
})

describe('mergedValue', () => {
  it('«стара, нова» через кому; порожні й дублікати пропускаються', () => {
    expect(mergedValue('Батько зник безвісти', 'Служба в ЗСУ (Іван)', { old: true, new: true })).toBe('Батько зник безвісти, Служба в ЗСУ (Іван)')
    expect(mergedValue('a', 'b', { old: false, new: true })).toBe('b')
    expect(mergedValue('', 'b', { old: true, new: true })).toBe('b')
    expect(mergedValue('Так', ' так ', { old: true, new: true })).toBe('Так')
    expect(choiceKind({ old: true, new: true })).toBe('both')
  })
})

describe('buildPlan', () => {
  it('у план потрапляють лише змінені поля, з урахуванням вибору', () => {
    const rows = [
      row('group_number', '8', '7'),
      row('social_status', 'Батько зник безвісти', 'Служба в ЗСУ (Іван)'),
      row('student_phone', '+380501111111', '+380502222222'),
      row('profession', 'Кухар', 'Кухар', false),
      row('address', 'Адреса 1', ''),
    ]
    const plan = buildPlan(rows, { social_status: { old: true, new: true }, student_phone: { old: true, new: false } })
    expect(plan.values).toEqual({
      group_number: '7',
      social_status: 'Батько зник безвісти, Служба в ЗСУ (Іван)',
      student_phone: '+380501111111',
      address: 'Адреса 1', // нове порожнє → лишилось старе
    })
    expect(plan.choices).toEqual({ group_number: 'new', social_status: 'both', student_phone: 'old', address: 'old' })
    expect([plan.newCount, plan.oldCount, plan.bothCount]).toEqual([1, 2, 1])
  })
})

describe('mergeSocialData', () => {
  const oldD = { codes: ['half_orphan'] }
  const newD = { codes: ['zsu'], zsu: 'Іван' }
  it('стара / нова / обидві', () => {
    expect(mergeSocialData(oldD, newD, 'old')).toEqual(oldD)
    expect(mergeSocialData(oldD, newD, 'new')).toEqual(newD)
    expect(mergeSocialData(oldD, newD, 'both')).toEqual({ codes: ['half_orphan', 'zsu'], zsu: 'Іван' })
  })
  it('«жодного з переліку» не поєднується з іншими', () => {
    expect(mergeSocialData({ codes: ['none'] }, newD, 'both')).toEqual({ codes: ['zsu'], zsu: 'Іван' })
    expect(mergeSocialData(null, null, 'both')).toEqual({ codes: [] })
  })
})

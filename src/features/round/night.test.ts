import { describe, expect, it } from 'vitest'
import { nightDate, nightLabel } from './night'

describe('nightDate (Київ, межа 18:00)', () => {
  it('після 18:00 — сьогоднішній вечір', () => {
    expect(nightDate(new Date('2026-11-12T16:00:00Z'))).toBe('2026-11-12') // 18:00 Київ (зима, UTC+2)
    expect(nightDate(new Date('2026-11-12T21:30:00Z'))).toBe('2026-11-12')
  })
  it('до 18:00 — вчорашній вечір (звіт видно весь наступний день)', () => {
    expect(nightDate(new Date('2026-11-12T15:59:00Z'))).toBe('2026-11-11') // 17:59 Київ
    expect(nightDate(new Date('2026-11-12T09:14:00Z'))).toBe('2026-11-11') // 11:14 Київ
    expect(nightDate(new Date('2026-11-12T22:30:00Z'))).toBe('2026-11-12') // 00:30 13.11 Київ
  })
  it('літній час (UTC+3)', () => {
    expect(nightDate(new Date('2026-07-10T15:00:00Z'))).toBe('2026-07-10') // 18:00 Київ
    expect(nightDate(new Date('2026-07-10T14:59:00Z'))).toBe('2026-07-09')
  })
  it('підпис дати', () => { expect(nightLabel('2026-11-11')).toMatch(/11/) })
})

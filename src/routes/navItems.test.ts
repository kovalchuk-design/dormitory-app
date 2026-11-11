import { describe, expect, it } from 'vitest'
import { canAccess, navItemsForRole } from './navItems'

const labels = (r: Parameters<typeof navItemsForRole>[0]) => navItemsForRole(r).map((i) => i.label)

describe('navItemsForRole', () => {
  it('адміністратор бачить «Адміністрування»', () => {
    expect(labels('admin')).toContain('Адміністрування')
    expect(labels('admin')).toHaveLength(6)
  })

  it.each(['educator', 'staff_readonly'] as const)('%s не бачить «Адміністрування»', (role) => {
    expect(labels(role)).not.toContain('Адміністрування')
  })

  it('вихователь бачить лише «Гуртожиток» і «Документи»', () => {
    expect(labels('educator')).toEqual(['Гуртожиток', 'Документи'])
  })

  it('«Анкети» (збір + оновлення даних) — лише для admin, зі значком forms', () => {
    expect(labels('admin')).toContain('Анкети')
    expect(labels('educator')).not.toContain('Анкети')
    expect(labels('staff_readonly')).not.toContain('Анкети')
    expect(labels(null)).not.toContain('Анкети')
    expect(navItemsForRole('admin').find((i) => i.to === '/forms')?.badge).toBe('forms')
  })

  it('«Івенти» і «Календар» видно, але вони вимкнені', () => {
    const items = navItemsForRole('admin')
    expect(items.find((i) => i.to === '/events')?.disabled).toBe(true)
    expect(items.find((i) => i.to === '/calendar')?.disabled).toBe(true)
    expect(items.filter((i) => i.disabled)).toHaveLength(2)
  })

  it('без ролі бачимо лише публічні пункти', () => {
    expect(labels(null)).not.toContain('Адміністрування')
  })

  it('зберігає порядок пунктів', () => {
    expect(labels('admin')).toEqual(['Гуртожиток', 'Анкети', 'Документи', 'Івенти', 'Календар', 'Адміністрування'])
  })
})

describe('canAccess', () => {
  it('/admin лише для admin', () => {
    expect(canAccess('admin', '/admin')).toBe(true)
    expect(canAccess('educator', '/admin')).toBe(false)
    expect(canAccess(null, '/admin')).toBe(false)
  })
  it('/forms недоступний для staff_readonly і вихователя', () => {
    expect(canAccess('staff_readonly', '/forms')).toBe(false)
    expect(canAccess('educator', '/forms')).toBe(false)
    expect(canAccess('admin', '/forms')).toBe(true)
  })
  it('вихователь: «Гуртожиток» і «Документи» відкриті, решта ні', () => {
    for (const p of ['/hostel', '/documents']) expect(canAccess('educator', p)).toBe(true)
    for (const p of ['/forms', '/events', '/calendar', '/admin']) expect(canAccess('educator', p)).toBe(false)
  })
  it('решта сторінок відкриті', () => {
    expect(canAccess('staff_readonly', '/hostel')).toBe(true)
  })
})

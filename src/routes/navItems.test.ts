import { describe, expect, it } from 'vitest'
import { canAccess, navItemsForRole } from './navItems'

const labels = (r: Parameters<typeof navItemsForRole>[0]) => navItemsForRole(r).map((i) => i.label)

describe('navItemsForRole', () => {
  it('адміністратор бачить «Адміністрування»', () => {
    expect(labels('admin')).toContain('Адміністрування')
    expect(labels('admin')).toHaveLength(7)
  })

  it.each(['educator', 'staff_readonly'] as const)('%s не бачить «Адміністрування»', (role) => {
    expect(labels(role)).not.toContain('Адміністрування')
  })

  it('вихователь бачить лише «Гуртожиток» і «Документи»', () => {
    expect(labels('educator')).toEqual(['Гуртожиток', 'Документи'])
  })

  it('«Оновлення даних» — лише для admin, зі значком pending', () => {
    expect(labels('admin')).toContain('Оновлення даних')
    expect(labels('educator')).not.toContain('Оновлення даних')
    expect(labels('staff_readonly')).not.toContain('Оновлення даних')
    expect(labels(null)).not.toContain('Оновлення даних')
    expect(navItemsForRole('admin').find((i) => i.to === '/updates')?.badge).toBe('pending')
  })

  it('«Збір анкет» — лише для admin, зі значком unmatched', () => {
    expect(labels('admin')).toContain('Збір анкет')
    expect(labels('educator')).not.toContain('Збір анкет')
    expect(labels('staff_readonly')).not.toContain('Збір анкет')
    expect(navItemsForRole('admin').find((i) => i.to === '/collect')?.badge).toBe('unmatched')
  })

  it('без ролі бачимо лише публічні пункти', () => {
    expect(labels(null)).not.toContain('Адміністрування')
  })

  it('зберігає порядок пунктів', () => {
    expect(labels('admin')).toEqual(['Гуртожиток', 'Оновлення даних', 'Збір анкет', 'Документи', 'Івенти', 'Календар', 'Адміністрування'])
  })
})

describe('canAccess', () => {
  it('/admin лише для admin', () => {
    expect(canAccess('admin', '/admin')).toBe(true)
    expect(canAccess('educator', '/admin')).toBe(false)
    expect(canAccess(null, '/admin')).toBe(false)
  })
  it('/collect недоступний для staff_readonly', () => {
    expect(canAccess('staff_readonly', '/collect')).toBe(false)
    expect(canAccess('admin', '/collect')).toBe(true)
  })
  it('/updates недоступний для staff_readonly', () => {
    expect(canAccess('staff_readonly', '/updates')).toBe(false)
    expect(canAccess('educator', '/updates')).toBe(false)
    expect(canAccess('admin', '/updates')).toBe(true)
  })
  it('вихователь: «Гуртожиток» і «Документи» відкриті, решта ні', () => {
    for (const p of ['/hostel', '/documents']) expect(canAccess('educator', p)).toBe(true)
    for (const p of ['/updates', '/collect', '/events', '/calendar', '/admin']) expect(canAccess('educator', p)).toBe(false)
  })
  it('решта сторінок відкриті', () => {
    expect(canAccess('staff_readonly', '/hostel')).toBe(true)
  })
})

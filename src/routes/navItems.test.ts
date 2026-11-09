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
    expect(labels(role)).toHaveLength(6)
  })

  it('без ролі бачимо лише публічні пункти', () => {
    expect(labels(null)).not.toContain('Адміністрування')
  })

  it('зберігає порядок пунктів', () => {
    expect(labels('educator')).toEqual(['Головна', 'Студенти', 'Кімнати', 'Документи', 'Івенти', 'Календар'])
  })
})

describe('canAccess', () => {
  it('/admin лише для admin', () => {
    expect(canAccess('admin', '/admin')).toBe(true)
    expect(canAccess('educator', '/admin')).toBe(false)
    expect(canAccess(null, '/admin')).toBe(false)
  })
  it('решта сторінок відкриті', () => {
    expect(canAccess('staff_readonly', '/students')).toBe(true)
  })
})

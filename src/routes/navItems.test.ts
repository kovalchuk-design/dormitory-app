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

  it('«Оновлення даних» — лише для admin і educator, зі значком pending', () => {
    expect(labels('admin')).toContain('Оновлення даних')
    expect(labels('educator')).toContain('Оновлення даних')
    expect(labels('staff_readonly')).not.toContain('Оновлення даних')
    expect(labels(null)).not.toContain('Оновлення даних')
    expect(navItemsForRole('educator').find((i) => i.to === '/updates')?.badge).toBe('pending')
  })

  it('«Збір анкет» — для admin і educator, зі значком unmatched', () => {
    expect(labels('admin')).toContain('Збір анкет')
    expect(labels('educator')).toContain('Збір анкет')
    expect(labels('staff_readonly')).not.toContain('Збір анкет')
    expect(navItemsForRole('educator').find((i) => i.to === '/collect')?.badge).toBe('unmatched')
  })

  it('без ролі бачимо лише публічні пункти', () => {
    expect(labels(null)).not.toContain('Адміністрування')
  })

  it('зберігає порядок пунктів', () => {
    expect(labels('educator')).toEqual(['Гуртожиток', 'Оновлення даних', 'Збір анкет', 'Документи', 'Івенти', 'Календар'])
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
    expect(canAccess('educator', '/updates')).toBe(true)
  })
  it('решта сторінок відкриті', () => {
    expect(canAccess('staff_readonly', '/hostel')).toBe(true)
  })
})

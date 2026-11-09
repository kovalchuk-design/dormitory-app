import { describe, expect, it } from 'vitest'
import { canDeleteDocument, canEditTemplates, canUpload } from './permissions'

describe('permissions (дзеркало RLS)', () => {
  it('завантаження', () => {
    expect(canUpload('admin')).toBe(true)
    expect(canUpload('educator')).toBe(true)
    expect(canUpload('staff_readonly')).toBe(false)
    expect(canUpload(null)).toBe(false)
  })
  it('видалення документа: admin або автор-вихователь', () => {
    const doc = { author_id: 'u1' }
    expect(canDeleteDocument({ id: 'x', role: 'admin' }, doc)).toBe(true)
    expect(canDeleteDocument({ id: 'u1', role: 'educator' }, doc)).toBe(true)
    expect(canDeleteDocument({ id: 'u2', role: 'educator' }, doc)).toBe(false)
    expect(canDeleteDocument({ id: 'u1', role: 'staff_readonly' }, doc)).toBe(false)
    expect(canDeleteDocument(null, doc)).toBe(false)
  })
  it('редагування шаблонів залежить від перемикача', () => {
    expect(canEditTemplates('admin', false)).toBe(true)
    expect(canEditTemplates('educator', false)).toBe(false)
    expect(canEditTemplates('educator', true)).toBe(true)
    expect(canEditTemplates('staff_readonly', true)).toBe(false)
  })
})

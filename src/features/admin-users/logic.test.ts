import { describe, expect, it } from 'vitest'
import {
  checkPasswordPolicy, generateTempPassword, protectionError, validateCreateUser, validateUpdateUser,
} from '../../../supabase/functions/_shared/adminUsers.ts'
import { EMPTY_FILTERS, filterUsers, lastSeenLabel, sortUsers, type AdminUser } from './logic'

const base = { full_name: 'Іваненко Петро Олегович', email: ' Test+A@Example.com ', role: 'educator', floor: 3, is_active: true, mode: 'password' }

describe('validateCreateUser', () => {
  it('нормалізує email і ПІБ', () => {
    const r = validateCreateUser({ ...base, full_name: '  Іваненко   Петро ' })
    expect(r.ok && r.value.email).toBe('test+a@example.com')
    expect(r.ok && r.value.full_name).toBe('Іваненко Петро')
  })
  it('відхиляє погані значення', () => {
    for (const bad of [{ email: 'x' }, { role: 'root' }, { floor: 7 }, { floor: 2.5 }, { full_name: 'ab' }, { mode: 'x' }, { is_active: 'yes' }]) {
      expect(validateCreateUser({ ...base, ...bad }).ok).toBe(false)
    }
  })
  it('поверх необов’язковий', () => {
    const r = validateCreateUser({ ...base, floor: null })
    expect(r.ok && r.value.floor).toBeNull()
  })
  it('не падає на сміття', () => {
    expect(validateCreateUser(null).ok).toBe(false)
    expect(validateCreateUser('x').ok).toBe(false)
  })
})

describe('validateUpdateUser', () => {
  const id = '5e5fba28-755b-4a2a-a858-ffafb89b3bf5'
  it('приймає часткове оновлення', () => {
    const r = validateUpdateUser({ user_id: id, is_active: false })
    expect(r).toEqual({ ok: true, value: { user_id: id, is_active: false } })
  })
  it('floor: null скидає поверх', () => {
    const r = validateUpdateUser({ user_id: id, floor: null })
    expect(r.ok && r.value.floor).toBeNull()
  })
  it('відхиляє неправильний id і роль', () => {
    expect(validateUpdateUser({ user_id: 'x' }).ok).toBe(false)
    expect(validateUpdateUser({ user_id: id, role: 'boss' }).ok).toBe(false)
  })
})

describe('generateTempPassword', () => {
  it('довжина ≥ 10, є малі/великі/цифри, без двозначних символів', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword()
      expect(p.length).toBe(14)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/\d/)
      expect(p).not.toMatch(/[0O1lI]/)
      expect(checkPasswordPolicy(p)).toBeNull()
    }
  })
  it('не повторюється', () => {
    expect(new Set(Array.from({ length: 500 }, () => generateTempPassword())).size).toBe(500)
  })
  it('не коротший за мінімум', () => {
    expect(generateTempPassword(4).length).toBe(10)
  })
})

describe('checkPasswordPolicy', () => {
  it('мінімум 10 символів', () => {
    expect(checkPasswordPolicy('123456789')).not.toBeNull()
    expect(checkPasswordPolicy('1234567890')).toBeNull()
    expect(checkPasswordPolicy('x'.repeat(73))).not.toBeNull()
  })
})

describe('protectionError', () => {
  const admin = { role: 'admin', is_active: true } as const
  it('не дає знизити чи деактивувати себе', () => {
    expect(protectionError({ actorId: 'a', targetId: 'a', current: admin, change: { role: 'educator' }, activeAdminCount: 3 })).toBe('self_demote')
    expect(protectionError({ actorId: 'a', targetId: 'a', current: admin, change: { is_active: false }, activeAdminCount: 3 })).toBe('self_deactivate')
  })
  it('не дає лишити систему без адміна', () => {
    expect(protectionError({ actorId: 'a', targetId: 'b', current: admin, change: { role: 'educator' }, activeAdminCount: 1 })).toBe('last_admin')
    expect(protectionError({ actorId: 'a', targetId: 'b', current: admin, change: { is_active: false }, activeAdminCount: 1 })).toBe('last_admin')
  })
  it('дозволяє, коли адмінів кілька', () => {
    expect(protectionError({ actorId: 'a', targetId: 'b', current: admin, change: { role: 'educator' }, activeAdminCount: 2 })).toBeNull()
  })
  it('дозволяє зміни звичайних користувачів і підвищення', () => {
    const ed = { role: 'educator', is_active: true } as const
    expect(protectionError({ actorId: 'a', targetId: 'b', current: ed, change: { is_active: false }, activeAdminCount: 1 })).toBeNull()
    expect(protectionError({ actorId: 'a', targetId: 'b', current: ed, change: { role: 'admin' }, activeAdminCount: 1 })).toBeNull()
  })
})

const u = (o: Partial<AdminUser>): AdminUser => ({
  id: Math.random().toString(), full_name: 'Тест', role: 'educator', floor: null, is_active: true,
  must_change_password: false, created_at: '', email: 'a@b.c', last_sign_in_at: null, ...o,
})

describe('filter / sort / lastSeen', () => {
  const list = [u({ full_name: 'Петренко', email: 'p@x.ua' }), u({ full_name: 'Андрієнко', role: 'admin', is_active: false }), u({ full_name: 'Бондар', role: 'staff_readonly' })]
  it('пошук за ПІБ та email', () => {
    expect(filterUsers(list, { ...EMPTY_FILTERS, q: 'ПЕТР' })).toHaveLength(1)
    expect(filterUsers(list, { ...EMPTY_FILTERS, q: 'p@x' })).toHaveLength(1)
  })
  it('фільтри ролі та статусу', () => {
    expect(filterUsers(list, { ...EMPTY_FILTERS, role: 'admin' })).toHaveLength(1)
    expect(filterUsers(list, { ...EMPTY_FILTERS, status: 'inactive' })).toHaveLength(1)
    expect(filterUsers(list, { ...EMPTY_FILTERS, status: 'active' })).toHaveLength(2)
  })
  it('активні першими, далі за алфавітом', () => {
    expect(sortUsers(list).map((x) => x.full_name)).toEqual(['Бондар', 'Петренко', 'Андрієнко'])
  })
  it('остання активність', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    expect(lastSeenLabel(null, now)).toBe('Ще не входив')
    expect(lastSeenLabel('2026-11-10T11:59:40Z', now)).toBe('щойно')
    expect(lastSeenLabel('2026-11-10T11:30:00Z', now)).toBe('30 хв тому')
    expect(lastSeenLabel('2026-11-10T09:00:00Z', now)).toBe('3 год тому')
    expect(lastSeenLabel('2026-11-08T12:00:00Z', now)).toBe('2 дн. тому')
  })
})

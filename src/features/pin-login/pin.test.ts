import { describe, expect, it } from 'vitest'
import { classifySecret, generatePin, hashPin, pinProblem, sessionIdFromJwt, verifyPin } from '../../../supabase/functions/_shared/pin.ts'
import { validateCreateUser, validateUpdateUser } from '../../../supabase/functions/_shared/adminUsers.ts'

describe('classifySecret', () => {
  it('рівно 4 цифри — PIN, решта — пароль', () => {
    expect(classifySecret('4827')).toBe('pin')
    expect(classifySecret('0482')).toBe('pin')
    expect(classifySecret('48271')).toBe('password')
    expect(classifySecret('482')).toBe('password')
    expect(classifySecret('48 7')).toBe('password')
    expect(classifySecret('abcd')).toBe('password')
    expect(classifySecret('Qwerty-12345')).toBe('password')
  })
})

describe('pinProblem', () => {
  it('приймає звичайні PIN', () => {
    for (const p of ['4827', '9031', '1357']) expect(pinProblem(p)).toBeNull()
  })
  it('відхиляє формат', () => {
    for (const p of ['123', '12345', 'abcd', '12 4', '', null, 1234]) expect(pinProblem(p)).not.toBeNull()
  })
  it('відхиляє прості', () => {
    for (const p of ['0000', '1111', '1234', '4321', '3456', '9876', '2580']) expect(pinProblem(p)).not.toBeNull()
  })
})

describe('generatePin', () => {
  it('завжди 4 цифри і не простий', () => {
    for (let i = 0; i < 500; i++) {
      const p = generatePin()
      expect(p).toMatch(/^\d{4}$/)
      expect(pinProblem(p)).toBeNull()
    }
  })
})

describe('hashPin / verifyPin', () => {
  it('перевіряє правильний і неправильний PIN, сіль різна', async () => {
    const h1 = await hashPin('4827')
    const h2 = await hashPin('4827')
    expect(h1).not.toBe(h2)
    expect(h1.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPin('4827', h1)).toBe(true)
    expect(await verifyPin('4828', h1)).toBe(false)
    expect(await verifyPin('4827', 'garbage')).toBe(false)
  })
})

describe('sessionIdFromJwt', () => {
  const mk = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`
  it('читає session_id', () => {
    expect(sessionIdFromJwt(mk({ session_id: 'abc-123', sub: 'x' }))).toBe('abc-123')
  })
  it('null для сміття', () => {
    expect(sessionIdFromJwt('nope')).toBeNull()
    expect(sessionIdFromJwt(mk({ sub: 'x' }))).toBeNull()
  })
})

describe('validate create / update з PIN', () => {
  const base = { full_name: 'Коваль Іван Петрович', email: 'a@b.ua', role: 'educator', floor: 2, is_active: true }
  it('режим pin без PIN → генерація; з PIN → перевірка', () => {
    const a = validateCreateUser({ ...base, mode: 'pin' })
    expect(a.ok && a.value.pin).toBeNull()
    const b = validateCreateUser({ ...base, mode: 'pin', pin: '4827' })
    expect(b.ok && b.value.pin).toBe('4827')
    expect(validateCreateUser({ ...base, mode: 'pin', pin: '1111' }).ok).toBe(false)
  })
  const id = '5e5fba28-755b-4a2a-a858-ffafb89b3bf5'
  it('оновлення: pin / generate_pin / unlock', () => {
    expect(validateUpdateUser({ user_id: id, pin: '4827' }).ok).toBe(true)
    expect(validateUpdateUser({ user_id: id, pin: '12' }).ok).toBe(false)
    expect(validateUpdateUser({ user_id: id, pin: '4827', generate_pin: true }).ok).toBe(false)
    const r = validateUpdateUser({ user_id: id, unlock: true })
    expect(r.ok && r.value.unlock).toBe(true)
    expect(validateUpdateUser({ user_id: id, unlock: 'yes' }).ok).toBe(false)
  })
})

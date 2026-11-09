import { describe, expect, it } from 'vitest'
import { sha256Hex, TOKEN_RE } from './token.ts'

describe('sha256Hex', () => {
  it('збігається з відомими векторами SHA-256 (як encode(digest(token,\'sha256\'),\'hex\') у БД)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('TOKEN_RE', () => {
  it('приймає лише 64 hex-символи нижнього регістру', () => {
    expect(TOKEN_RE.test('a'.repeat(64))).toBe(true)
    expect(TOKEN_RE.test('A'.repeat(64))).toBe(false)
    expect(TOKEN_RE.test('a'.repeat(63))).toBe(false)
    expect(TOKEN_RE.test(`${'a'.repeat(64)}\n`)).toBe(false)
    expect(TOKEN_RE.test('')).toBe(false)
  })
})

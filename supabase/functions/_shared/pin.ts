// PIN helpers shared by the Edge Functions and tests (pure TS + Web Crypto; no Deno/DOM-only APIs).

export const PIN_RE = /^\d{4}$/

/** Login field: exactly 4 digits = PIN, anything else = full password. */
export function classifySecret(secret: string): 'pin' | 'password' {
  return PIN_RE.test(secret) ? 'pin' : 'password'
}

/** null = fine, otherwise a Ukrainian message. Rejects 0000, 1111, 1234, 4321, 2580 ... */
export function pinProblem(pin: unknown): string | null {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return 'PIN має складатися рівно з 4 цифр'
  if (/^(\d)\1{3}$/.test(pin)) return 'Занадто простий PIN (однакові цифри)'
  const d = [...pin].map(Number)
  const step = d[1] - d[0]
  if ((step === 1 || step === -1) && d.every((v, i) => i === 0 || v - d[i - 1] === step)) {
    return 'Занадто простий PIN (послідовність цифр)'
  }
  if (['2580', '1212', '2121', '1004', '2000', '2024', '2025', '2026'].includes(pin)) return 'Занадто простий PIN'
  return null
}

function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

export function generatePin(): string {
  for (;;) {
    const pin = Array.from({ length: 4 }, () => String(randomIndex(10))).join('')
    if (pinProblem(pin) === null) return pin
  }
}

const ITERATIONS = 100_000
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** `pbkdf2$<iterations>$<salt b64>$<hash b64>` */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(pin, salt, ITERATIONS))}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [kind, iter, salt, hash] = stored.split('$')
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false
  const got = await derive(pin, unb64(salt), Number(iter))
  const want = unb64(hash)
  if (got.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i] // constant time
  return diff === 0
}

/** `session_id` claim of a (already verified) Supabase access token; null if absent/malformed. */
export function sessionIdFromJwt(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const sid = JSON.parse(json).session_id
    return typeof sid === 'string' ? sid : null
  } catch {
    return null
  }
}

// Shared by Edge Functions (Deno) and tests (Node). Uses only Web Crypto.
// Must match create_update_request(): encode(digest(token, 'sha256'), 'hex') — SHA-256 over the UTF-8 bytes of the token string.

/** Tokens are 32 random bytes in hex = 64 lowercase hex chars. Anything else is invalid without touching the DB. */
export const TOKEN_RE = /^[0-9a-f]{64}$/

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

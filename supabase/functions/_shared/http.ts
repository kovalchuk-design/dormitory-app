// Small helpers shared by the public Edge Functions (Deno runtime).
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // public endpoints, no cookies/credentials involved
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/** Same body for unknown / expired / used / revoked links — never reveals which one it was. */
export const INVALID_LINK = () => json({ ok: false, error: 'invalid_link' }, 404)
export const RATE_LIMITED = () => json({ ok: false, error: 'rate_limited' }, 429)

export const MAX_BODY_BYTES = 20_000

/** service_role client — exists only inside the function; the key never leaves the Edge runtime. */
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

/** Reads a JSON body with a hard size cap. Returns null when too large / not JSON. */
export async function readJson(req: Request): Promise<{ tooLarge: boolean; data: Record<string, unknown> | null }> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return { tooLarge: true, data: null }
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { tooLarge: true, data: null }
  try {
    const parsed = JSON.parse(text)
    return { tooLarge: false, data: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null }
  } catch {
    return { tooLarge: false, data: null }
  }
}

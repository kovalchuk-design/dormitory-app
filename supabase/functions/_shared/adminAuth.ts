// Caller check for admin-* functions: valid JWT → active profile with role admin. Uses service_role only after that.
import { adminClient, CORS_HEADERS } from './http.ts'

export { adminClient }

export function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export interface Caller { id: string }

/** Returns the caller or a ready Response (401 / 403 / 429 / 503). */
export async function requireAdmin(
  req: Request, db: ReturnType<typeof adminClient>, bucket: string, limit: number,
): Promise<{ caller: Caller } | { response: Response }> {
  const auth = req.headers.get('authorization') ?? ''
  const jwt = /^Bearer\s+(.+)$/i.exec(auth)?.[1]
  if (!jwt) return { response: reply({ ok: false, error: 'unauthorized' }, 401) }
  const { data, error } = await db.auth.getUser(jwt)
  if (error || !data.user) return { response: reply({ ok: false, error: 'unauthorized' }, 401) }
  const id = data.user.id

  const prof = await db.from('profiles').select('role, is_active').eq('id', id).maybeSingle()
  if (prof.error) return { response: reply({ ok: false, error: 'unavailable' }, 503) }
  if (!prof.data || prof.data.role !== 'admin' || prof.data.is_active !== true) {
    return { response: reply({ ok: false, error: 'forbidden' }, 403) }
  }

  const hit = await db.rpc('questionnaire_rate_hit', { p_key: `adminusers:${bucket}:${id}`, p_limit: limit, p_window_seconds: 600 })
  if (hit.error) return { response: reply({ ok: false, error: 'unavailable' }, 503) }
  if (hit.data !== true) return { response: reply({ ok: false, error: 'rate_limited' }, 429) }
  return { caller: { id } }
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text()
  if (text.length > 10_000) return null
  try {
    const v = JSON.parse(text)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** Maps DB exception text from svc_admin_update_profile to a stable error code. */
export function dbErrorCode(message: string | undefined): string {
  const m = message ?? ''
  if (m.startsWith('LAST_ADMIN')) return 'last_admin'
  if (m.startsWith('SELF')) return 'self_change'
  if (m.startsWith('NOT_FOUND')) return 'not_found'
  if (m.startsWith('FORBIDDEN')) return 'forbidden'
  if (m.startsWith('INVALID')) return 'validation'
  return 'unavailable'
}

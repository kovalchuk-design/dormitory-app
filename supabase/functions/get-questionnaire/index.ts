// Public endpoint (verify_jwt = false): returns the pupil's name and prefilled latest APPROVED data for a valid link.
// No tables are readable by anon; the service_role client lives only here and calls a token-checked SQL function.
import { sha256Hex, TOKEN_RE } from '../_shared/token.ts'
import { adminClient, clientIp, CORS_HEADERS, INVALID_LINK, json, RATE_LIMITED, readJson } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const { tooLarge, data } = await readJson(req)
  if (tooLarge) return json({ ok: false, error: 'too_large' }, 413)

  const db = adminClient()
  const ipOk = await db.rpc('questionnaire_rate_hit', { p_key: `get:ip:${clientIp(req)}`, p_limit: 60, p_window_seconds: 600 })
  if (ipOk.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (ipOk.data !== true) return RATE_LIMITED()

  const token = typeof data?.token === 'string' ? data.token : ''
  if (!TOKEN_RE.test(token)) return INVALID_LINK()

  const res = await db.rpc('get_questionnaire_data', { p_token_hash: await sha256Hex(token) })
  if (res.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (res.data == null) return INVALID_LINK()
  return json({ ok: true, ...(res.data as Record<string, unknown>) })
})

// Public endpoint (verify_jwt = false). Two kinds of links, indistinguishable to the caller when invalid:
//  * personal link (update_requests): returns the pupil's name and prefilled latest APPROVED data;
//  * shared per-floor link (intake_links): returns only {mode:'shared'} — no personal data at all (matching happens on submit).
// No tables are readable by anon; the service_role client lives only here and calls token-checked SQL functions.
import { sha256Hex, TOKEN_RE } from '../_shared/token.ts'
import { adminClient, clientIp, CORS_HEADERS, INVALID_LINK, json, RATE_LIMITED, readJson } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const { tooLarge, data } = await readJson(req)
  if (tooLarge) return json({ ok: false, error: 'too_large' }, 413)

  const db = adminClient()
  // generous per-IP limit: a whole floor may share one Wi-Fi / mobile NAT address
  const ipOk = await db.rpc('questionnaire_rate_hit', { p_key: `get:ip:${clientIp(req)}`, p_limit: 300, p_window_seconds: 600 })
  if (ipOk.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (ipOk.data !== true) return RATE_LIMITED()

  const token = typeof data?.token === 'string' ? data.token : ''
  if (!TOKEN_RE.test(token)) return INVALID_LINK()
  const tokenHash = await sha256Hex(token)

  const personal = await db.rpc('get_questionnaire_data', { p_token_hash: tokenHash })
  if (personal.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (personal.data != null) return json({ ok: true, mode: 'personal', ...(personal.data as Record<string, unknown>) })

  const shared = await db.rpc('get_intake_link_state', { p_token_hash: tokenHash })
  if (shared.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (shared.data === true) return json({ ok: true, mode: 'shared', full_name: '', birth_date: null, room: null, profile: null })
  return INVALID_LINK()
})

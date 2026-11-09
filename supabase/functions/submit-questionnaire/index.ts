// Public endpoint (verify_jwt = false): validates the payload server-side, then
//  * personal link → submit_questionnaire(): burns the token and inserts a `pending` version for that pupil (one transaction);
//  * shared per-floor link → submit_intake(): matches by exact ПІБ + birth date (unique active pupil) or queues it as "unmatched".
// The caller gets the same {ok:true} either way and never learns whether a match happened.
import { sha256Hex, TOKEN_RE } from '../_shared/token.ts'
import { validateQuestionnaire } from '../_shared/questionnaire.ts'
import { adminClient, clientIp, CORS_HEADERS, INVALID_LINK, json, RATE_LIMITED, readJson } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const { tooLarge, data } = await readJson(req)
  if (tooLarge) return json({ ok: false, error: 'too_large' }, 413)
  if (!data) return json({ ok: false, error: 'bad_request' }, 400)

  const db = adminClient()
  // generous per-IP limit (a floor / the whole dorm may share one Wi-Fi address); the real caps are per link
  const ipOk = await db.rpc('questionnaire_rate_hit', { p_key: `submit:ip:${clientIp(req)}`, p_limit: 300, p_window_seconds: 600 })
  if (ipOk.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (ipOk.data !== true) return RATE_LIMITED()

  const token = typeof data.token === 'string' ? data.token : ''
  if (!TOKEN_RE.test(token)) return INVALID_LINK()
  const tokenHash = await sha256Hex(token)

  const tokOk = await db.rpc('questionnaire_rate_hit', { p_key: `submit:tok:${tokenHash}`, p_limit: 300, p_window_seconds: 600 })
  if (tokOk.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (tokOk.data !== true) return RATE_LIMITED()

  // Validation errors depend only on the payload (not on the token), so they leak nothing about the link.
  const result = validateQuestionnaire(data.answers)
  if (!result.ok) return json({ ok: false, error: 'validation', fields: result.errors }, 400)

  const personal = await db.rpc('submit_questionnaire', { p_token_hash: tokenHash, p_payload: result.value })
  if (personal.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (personal.data === true) return json({ ok: true })

  const shared = await db.rpc('submit_intake', { p_token_hash: tokenHash, p_payload: result.value })
  if (shared.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (shared.data === true) return json({ ok: true })
  return INVALID_LINK()
})

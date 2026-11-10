// Public login endpoint (verify_jwt = false) for the "pick a name + PIN / password" screen.
//  action "list"   → [{id, name}] of active staff (names only: no emails, no roles)
//  action "signin" → {user_id, secret}: exactly 4 digits = PIN (3 attempts, then locked until an admin unlocks);
//                    anything else = full password. PIN sessions are marked in pin_sessions (no admin rights).
import { adminClient, anonClient, clientIp, CORS_HEADERS, json, readJson } from '../_shared/http.ts'
import { classifySecret, sessionIdFromJwt, verifyPin } from '../_shared/pin.ts'

const INVALID = () => json({ ok: false, error: 'invalid_credentials' }, 401)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)
  const { tooLarge, data } = await readJson(req)
  if (tooLarge || !data) return json({ ok: false, error: 'bad_request' }, 400)

  const db = adminClient()
  const ip = clientIp(req)
  const hit = async (key: string, limit: number, seconds: number) => {
    const r = await db.rpc('questionnaire_rate_hit', { p_key: key, p_limit: limit, p_window_seconds: seconds })
    return r.error ? 'error' : r.data === true ? 'ok' : 'limited'
  }

  if (data.action === 'list') {
    const rl = await hit(`login:list:${ip}`, 300, 600)
    if (rl === 'error') return json({ ok: false, error: 'unavailable' }, 503)
    if (rl === 'limited') return json({ ok: false, error: 'rate_limited' }, 429)
    const r = await db.from('profiles').select('id, full_name').eq('is_active', true).in('role', ['educator', 'admin']).order('full_name')
    if (r.error) return json({ ok: false, error: 'unavailable' }, 503)
    return json({ ok: true, users: r.data.map((p) => ({ id: p.id, name: p.full_name })) })
  }

  if (data.action !== 'signin') return json({ ok: false, error: 'bad_request' }, 400)
  const userId = typeof data.user_id === 'string' && UUID_RE.test(data.user_id) ? data.user_id : null
  const secret = typeof data.secret === 'string' ? data.secret : ''
  if (!userId || secret.length < 1 || secret.length > 72) return INVALID()

  const rl = await hit(`login:ip:${ip}`, 120, 600)
  if (rl === 'error') return json({ ok: false, error: 'unavailable' }, 503)
  if (rl === 'limited') return json({ ok: false, error: 'rate_limited' }, 429)

  const prof = await db.from('profiles').select('is_active, role').eq('id', userId).maybeSingle()
  if (prof.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (!prof.data || !prof.data.is_active) return INVALID()
  const u = await db.auth.admin.getUserById(userId)
  const email = u.data.user?.email
  if (u.error || !email) return json({ ok: false, error: 'unavailable' }, 503)

  if (classifySecret(secret) === 'password') {
    // Full password. Not lockable by anyone else's PIN failures; brute force is limited per account and per IP.
    const pw = await hit(`login:pw:${userId}`, 10, 900)
    if (pw === 'error') return json({ ok: false, error: 'unavailable' }, 503)
    if (pw === 'limited') return json({ ok: false, error: 'rate_limited' }, 429)
    const { data: s, error } = await anonClient().auth.signInWithPassword({ email, password: secret })
    if (error || !s.session) return json({ ok: false, error: 'invalid_credentials', kind: 'password' }, 401)
    return json({ ok: true, kind: 'password', access_token: s.session.access_token, refresh_token: s.session.refresh_token })
  }

  // PIN
  const cred = await db.from('pin_credentials').select('pin_hash, locked_at').eq('user_id', userId).maybeSingle()
  if (cred.error) return json({ ok: false, error: 'unavailable' }, 503)
  if (!cred.data) return json({ ok: false, error: 'invalid_credentials', kind: 'pin' }, 401)
  if (cred.data.locked_at) return json({ ok: false, error: 'locked' }, 423)
  const begin = await db.rpc('svc_pin_begin_attempt', { p_user: userId }) // reserved BEFORE verifying: ≤3 guesses even in parallel
  if (begin.error) return json({ ok: false, error: 'unavailable' }, 503)
  const attempt = begin.data as number
  if (attempt === 0) return json({ ok: false, error: 'locked' }, 423)
  if (attempt < 0) return json({ ok: false, error: 'invalid_credentials', kind: 'pin' }, 401)

  if (!(await verifyPin(secret, cred.data.pin_hash))) {
    const locked = (await db.rpc('svc_pin_fail', { p_user: userId })).data === true
    if (locked) await db.rpc('svc_admin_audit', { p_actor: null, p_target: userId, p_event: 'pin_locked', p_details: {} })
    return json({ ok: false, error: locked ? 'locked' : 'invalid_credentials', kind: 'pin', attempts_left: Math.max(0, 3 - attempt) }, locked ? 423 : 401)
  }
  await db.rpc('svc_pin_success', { p_user: userId })

  // Session without knowing any password: server-side magic-link exchange (no e-mail is sent).
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link.data?.properties?.hashed_token
  if (link.error || !tokenHash) return json({ ok: false, error: 'unavailable' }, 503)
  const { data: s, error } = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (error || !s.session) return json({ ok: false, error: 'unavailable' }, 503)
  const sid = sessionIdFromJwt(s.session.access_token)
  const reg = sid ? await db.from('pin_sessions').insert({ session_id: sid, user_id: userId }) : { error: true }
  if (reg.error) {
    await db.auth.admin.signOut(s.session.access_token, 'local') // never hand out an unmarked PIN session
    return json({ ok: false, error: 'unavailable' }, 503)
  }
  return json({ ok: true, kind: 'pin', access_token: s.session.access_token, refresh_token: s.session.refresh_token })
})

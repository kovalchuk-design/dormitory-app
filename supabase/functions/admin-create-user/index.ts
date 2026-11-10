// Admin creates an account: PIN (educators), temporary password (shown once) or email invite.
import { adminClient, preflight, readBody, reply, requireAdmin } from '../_shared/adminAuth.ts'
import { generateTempPassword, validateCreateUser } from '../_shared/adminUsers.ts'
import { generatePin, hashPin } from '../_shared/pin.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405)
  const db = adminClient()
  const gate = await requireAdmin(req, db, 'create', 30)
  if ('response' in gate) return gate.response
  const actor = gate.caller.id

  const body = await readBody(req)
  if (!body) return reply({ ok: false, error: 'bad_request' }, 400)
  const v = validateCreateUser(body)
  if (!v.ok) return reply({ ok: false, error: 'validation', fields: v.errors }, 400)
  const u = v.value

  let userId: string | undefined
  let password: string | undefined
  let pin: string | undefined
  if (u.mode === 'invite') {
    const { data, error } = await db.auth.admin.inviteUserByEmail(u.email, { data: { full_name: u.full_name } })
    if (error || !data.user) return createFailure(error)
    userId = data.user.id
  } else {
    // 'password': the temporary password is shown to the admin once. 'pin': the auth password is random and
    // unknown to everyone — the person signs in with the PIN only.
    password = generateTempPassword(u.mode === 'pin' ? 40 : 14)
    const { data, error } = await db.auth.admin.createUser({
      email: u.email, password, email_confirm: true, user_metadata: { full_name: u.full_name },
    })
    if (error || !data.user) return createFailure(error)
    userId = data.user.id
    if (u.mode === 'pin') {
      pin = u.pin ?? generatePin()
      const ins = await db.from('pin_credentials').upsert({ user_id: userId, pin_hash: await hashPin(pin), failed_attempts: 0, locked_at: null })
      if (ins.error) {
        await db.auth.admin.deleteUser(userId)
        return reply({ ok: false, error: 'unavailable' }, 503)
      }
    }
  }

  const upd = await db.rpc('svc_admin_update_profile', {
    p_actor: actor, p_target: userId, p_full_name: u.full_name, p_role: u.role,
    p_floor: u.floor, p_set_floor: true, p_is_active: u.is_active, p_must_change_password: u.mode !== 'pin',
  })
  if (upd.error) {
    await db.auth.admin.deleteUser(userId) // roll back: no half-created accounts
    return reply({ ok: false, error: 'unavailable' }, 503)
  }
  await db.rpc('svc_admin_audit', {
    p_actor: actor, p_target: userId, p_event: 'user_created',
    p_details: { mode: u.mode, role: u.role, floor: u.floor, is_active: u.is_active },
  })
  return reply({
    ok: true, user_id: userId, mode: u.mode,
    ...(u.mode === 'password' && password ? { temporary_password: password } : {}),
    ...(pin ? { pin } : {}),
  })
})

function createFailure(error: { code?: string; status?: number } | null) {
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
    return reply({ ok: false, error: 'email_taken' }, 409)
  }
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) {
    return reply({ ok: false, error: 'email_rate_limited' }, 429)
  }
  return reply({ ok: false, error: 'unavailable' }, 503)
}

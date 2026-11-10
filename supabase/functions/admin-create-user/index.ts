// Admin creates an account: temporary password (shown once to the admin) or email invite.
import { adminClient, preflight, readBody, reply, requireAdmin } from '../_shared/adminAuth.ts'
import { generateTempPassword, validateCreateUser } from '../_shared/adminUsers.ts'

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
  if (u.mode === 'password') {
    password = generateTempPassword()
    const { data, error } = await db.auth.admin.createUser({
      email: u.email, password, email_confirm: true, user_metadata: { full_name: u.full_name },
    })
    if (error || !data.user) return createFailure(error)
    userId = data.user.id
  } else {
    const { data, error } = await db.auth.admin.inviteUserByEmail(u.email, { data: { full_name: u.full_name } })
    if (error || !data.user) return createFailure(error)
    userId = data.user.id
  }

  // The auth trigger made an inactive staff_readonly profile; apply the requested values.
  const upd = await db.rpc('svc_admin_update_profile', {
    p_actor: actor, p_target: userId, p_full_name: u.full_name, p_role: u.role,
    p_floor: u.floor, p_set_floor: true, p_is_active: u.is_active, p_must_change_password: true,
  })
  if (upd.error) {
    await db.auth.admin.deleteUser(userId) // roll back: no half-created accounts
    return reply({ ok: false, error: 'unavailable' }, 503)
  }
  await db.rpc('svc_admin_audit', {
    p_actor: actor, p_target: userId, p_event: 'user_created',
    p_details: { mode: u.mode, role: u.role, floor: u.floor, is_active: u.is_active },
  })
  return reply({ ok: true, user_id: userId, mode: u.mode, ...(password ? { temporary_password: password } : {}) })
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

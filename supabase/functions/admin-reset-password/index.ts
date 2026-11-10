// Admin sets a new temporary password for a user (shown once), forces a change at next sign-in, revokes sessions.
import { adminClient, preflight, readBody, reply, requireAdmin } from '../_shared/adminAuth.ts'
import { generateTempPassword, isUuid } from '../_shared/adminUsers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405)
  const db = adminClient()
  const gate = await requireAdmin(req, db, 'reset', 20)
  if ('response' in gate) return gate.response
  const actor = gate.caller.id

  const body = await readBody(req)
  if (!body || !isUuid(body.user_id)) return reply({ ok: false, error: 'validation' }, 400)
  const target = body.user_id
  if (target === actor) return reply({ ok: false, error: 'self_change' }, 409) // own password: "Змінити пароль"

  const prof = await db.from('profiles').select('id').eq('id', target).maybeSingle()
  if (prof.error) return reply({ ok: false, error: 'unavailable' }, 503)
  if (!prof.data) return reply({ ok: false, error: 'not_found' }, 404)

  const password = generateTempPassword()
  const { error } = await db.auth.admin.updateUserById(target, { password })
  if (error) return reply({ ok: false, error: 'unavailable' }, 503)
  const flag = await db.rpc('svc_admin_update_profile', { p_actor: actor, p_target: target, p_must_change_password: true })
  if (flag.error) return reply({ ok: false, error: 'unavailable' }, 503)
  await db.rpc('svc_admin_revoke_sessions', { p_user: target })
  await db.rpc('svc_admin_audit', { p_actor: actor, p_target: target, p_event: 'password_reset', p_details: {} })
  return reply({ ok: true, temporary_password: password })
})

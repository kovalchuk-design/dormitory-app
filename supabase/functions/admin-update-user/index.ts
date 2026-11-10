// Admin edits role / floor / active flag / name, or force-signs-out a user. Never deletes.
import { adminClient, dbErrorCode, preflight, readBody, reply, requireAdmin } from '../_shared/adminAuth.ts'
import { protectionError, validateUpdateUser } from '../_shared/adminUsers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405)
  const db = adminClient()
  const gate = await requireAdmin(req, db, 'update', 60)
  if ('response' in gate) return gate.response
  const actor = gate.caller.id

  const body = await readBody(req)
  if (!body) return reply({ ok: false, error: 'bad_request' }, 400)
  const v = validateUpdateUser(body)
  if (!v.ok) return reply({ ok: false, error: 'validation', fields: v.errors }, 400)
  const u = v.value

  const cur = await db.from('profiles').select('role, is_active, floor').eq('id', u.user_id).maybeSingle()
  if (cur.error) return reply({ ok: false, error: 'unavailable' }, 503)
  if (!cur.data) return reply({ ok: false, error: 'not_found' }, 404)

  const admins = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true)
  if (admins.error) return reply({ ok: false, error: 'unavailable' }, 503)
  const prot = protectionError({
    actorId: actor, targetId: u.user_id,
    current: cur.data as { role: 'admin' | 'educator' | 'staff_readonly'; is_active: boolean },
    change: { role: u.role, is_active: u.is_active }, activeAdminCount: admins.count ?? 0,
  })
  if (prot) return reply({ ok: false, error: prot }, 409)

  const hasProfileChange = u.full_name !== undefined || u.role !== undefined || u.floor !== undefined || u.is_active !== undefined
  if (hasProfileChange) {
    const upd = await db.rpc('svc_admin_update_profile', {
      p_actor: actor, p_target: u.user_id, p_full_name: u.full_name ?? null, p_role: u.role ?? null,
      p_floor: u.floor ?? null, p_set_floor: u.floor !== undefined, p_is_active: u.is_active ?? null,
      p_must_change_password: null,
    })
    if (upd.error) {
      const code = dbErrorCode(upd.error.message)
      return reply({ ok: false, error: code }, code === 'unavailable' ? 503 : code === 'not_found' ? 404 : 409)
    }
    if (u.role !== undefined && u.role !== cur.data.role) {
      await db.rpc('svc_admin_audit', { p_actor: actor, p_target: u.user_id, p_event: 'role_changed', p_details: { from: cur.data.role, to: u.role } })
    }
    if (u.is_active !== undefined && u.is_active !== cur.data.is_active) {
      await db.rpc('svc_admin_audit', { p_actor: actor, p_target: u.user_id, p_event: u.is_active ? 'user_activated' : 'user_deactivated', p_details: {} })
    }
  }

  let revoked: number | null = null
  if (u.revoke_sessions === true || u.is_active === false) {
    const r = await db.rpc('svc_admin_revoke_sessions', { p_user: u.user_id })
    if (r.error) return reply({ ok: false, error: 'unavailable' }, 503)
    revoked = r.data as number
    await db.rpc('svc_admin_audit', { p_actor: actor, p_target: u.user_id, p_event: 'sessions_revoked', p_details: { count: revoked } })
  }
  return reply({ ok: true, revoked_sessions: revoked })
})

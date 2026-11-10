// Admin list: profiles joined with auth.users (email, last sign-in).
import { adminClient, preflight, reply, requireAdmin } from '../_shared/adminAuth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST' && req.method !== 'GET') return reply({ ok: false, error: 'method_not_allowed' }, 405)
  const db = adminClient()
  const gate = await requireAdmin(req, db, 'list', 120)
  if ('response' in gate) return gate.response

  const profiles = await db.from('profiles')
    .select('id, full_name, role, floor, is_active, must_change_password, created_at').order('full_name')
  if (profiles.error) return reply({ ok: false, error: 'unavailable' }, 503)

  const auth = new Map<string, { email: string | null; last_sign_in_at: string | null }>()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return reply({ ok: false, error: 'unavailable' }, 503)
    for (const u of data.users) auth.set(u.id, { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null })
    if (data.users.length < 200) break
  }
  const users = profiles.data.map((p) => ({ ...p, email: auth.get(p.id)?.email ?? null, last_sign_in_at: auth.get(p.id)?.last_sign_in_at ?? null }))
  return reply({ ok: true, users })
})

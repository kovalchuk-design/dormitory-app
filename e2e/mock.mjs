// Стенд для UI-перевірок без доступу до живої бази: Supabase підмінюється вигаданими даними (усі імена — згенеровані).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
export const { chromium, devices } = require('playwright')

export const MOCK_URL = 'http://mock.local'
const LAST = ['Коваленко', 'Бондаренко', 'Мельник', 'Шевченко', 'Ткаченко', 'Кравченко', 'Олійник', 'Поліщук', 'Лисенко', 'Гриценко', 'Савченко', 'Руденко', 'Мартинюк', 'Марченко', 'Петренко']
const FIRST = ['Олександр', 'Андрій', 'Максим', 'Іван', 'Дмитро', 'Артем', 'Богдан', 'Назар', 'Ілля', 'Тарас']
const PAT = ['Олексійович', 'Іванович', 'Петрович', 'Миколайович', 'Андрійович', 'Сергійович']

export function makeData(n = 250) {
  const students = [], assignments = [], profiles = [], rooms = []
  for (const floor of [2, 3, 4, 5]) for (let i = 1; i <= 12; i++) rooms.push({ id: `r${floor}${i}`, number: `${floor}${String(i).padStart(2, '0')}`, floor, capacity: 4, status: 'active' })
  for (let i = 0; i < n; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    students.push({
      id, last_name: `ТЕСТ_${LAST[i % LAST.length]}${i >= LAST.length ? ' ' + Math.floor(i / LAST.length) : ''}`, first_name: FIRST[(i * 3) % FIRST.length],
      patronymic: PAT[i % PAT.length], birth_date: '2009-05-01', grade: 9 + (i % 3), status: 'active', notes: i % 17 === 0 ? 'Тестова примітка' : null,
    })
    if (i % 7 !== 0) { const r = rooms[i % rooms.length]; assignments.push({ student_id: id, rooms: { number: r.number, floor: r.floor } }) }
    profiles.push({
      student_id: id, student_phone: `067000${String(i).padStart(4, '0')}`, mother_phone: `050111${String(i).padStart(4, '0')}`, father_phone: null, guardian_phone: null,
      group_number: String(21 + (i % 6)), social_status: i % 11 === 0 ? 'Сирота' : null,
    })
  }
  return { students, assignments, profiles, rooms }
}

/** Підміняє всі запити до MOCK_URL. `overrides(url, method)` може повернути {status, body} для особливих випадків. */
export async function installMock(context, { role = 'admin', data = makeData(), overrides } = {}) {
  const uid = '11111111-1111-4111-8111-111111111111'
  const session = {
    access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }
  await context.addInitScript((s) => { try { localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)) } catch { /* */ } }, session)
  await context.route(`${MOCK_URL}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    const custom = overrides?.(url, req.method())
    if (custom) return json(custom.body, custom.status ?? 200)
    const p = url.pathname
    const single = (rows) => (req.headers()['accept'] ?? '').includes('vnd.pgrst.object') ? json(rows[0] ?? null, rows[0] ? 200 : 406) : json(rows)
    if (p.startsWith('/auth/v1')) return json({})
    if (p === '/rest/v1/profiles') return single([{ id: uid, full_name: 'ТЕСТ Користувач', role, floor: null, must_change_password: false }])
    if (p === '/rest/v1/rpc/my_session_is_pin') return json(false)
    if (p === '/rest/v1/students') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      return id ? single(data.students.filter((s) => s.id === id)) : json(data.students)
    }
    if (p === '/rest/v1/room_assignments') return json(data.assignments)
    if (p === '/rest/v1/student_profiles') return json(data.profiles)
    if (p === '/rest/v1/rooms') return json(data.rooms)
    return json([])
  })
}

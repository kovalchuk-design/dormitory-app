import type { StudentRow } from './studentsList'

export interface IntakeLink {
  id: string
  floor: number | null
  expires_at: string
  revoked_at: string | null
  created_at: string
  max_submissions: number
}

export type LinkState = 'active' | 'expired' | 'revoked'

export function linkState(l: Pick<IntakeLink, 'expires_at' | 'revoked_at'>, now: Date = new Date()): LinkState {
  if (l.revoked_at) return 'revoked'
  return new Date(l.expires_at).getTime() > now.getTime() ? 'active' : 'expired'
}

/** Діюче посилання поверху (одне на поверх: нове скасовує попереднє). */
export function activeLinkForFloor(links: IntakeLink[], floor: number, now: Date = new Date()): IntakeLink | null {
  return links.find((l) => l.floor === floor && linkState(l, now) === 'active') ?? null
}

/** Приблизно як `private.norm_name` у базі: регістр, апострофи, пробіли, розділові знаки. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/['’ʼ`]/g, '').replace(/[^а-яіїєґё0-9a-z]+/g, ' ').trim()
}

const fullName = (s: Pick<StudentRow, 'last_name' | 'first_name' | 'patronymic'>) =>
  [s.last_name, s.first_name, s.patronymic].filter(Boolean).join(' ')

/** Підказки для ручного зіставлення: той самий день народження, спільне прізвище/імʼя, схожий початок слова. */
export function suggestCandidates(
  sub: { name: string; birth_date: string },
  students: StudentRow[],
  limit = 6,
): StudentRow[] {
  const tokens = normName(sub.name).split(' ').filter(Boolean)
  const scored = students
    .filter((s) => s.status === 'active')
    .map((s) => {
      const st = normName(fullName(s)).split(' ').filter(Boolean)
      let score = s.birth_date === sub.birth_date ? 3 : 0
      for (const t of tokens) {
        if (st.includes(t)) score += 2
        else if (t.length >= 4 && st.some((x) => x.length >= 4 && (x.startsWith(t.slice(0, 4)) || t.startsWith(x.slice(0, 4))))) score += 1
      }
      return { s, score }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || fullName(a.s).localeCompare(fullName(b.s), 'uk'))
  return scored.slice(0, limit).map((x) => x.s)
}

/** Початок поточного збору: найраніше з посилань, створених за останні `days` днів (інакше — null = за весь час). */
export function campaignSince(links: Pick<IntakeLink, 'created_at'>[], now: Date = new Date(), days = 30): Date | null {
  const limit = now.getTime() - days * 86_400_000
  const recent = links.map((l) => new Date(l.created_at).getTime()).filter((t) => t >= limit)
  return recent.length ? new Date(Math.min(...recent)) : null
}

export interface ProfileStamp {
  student_id: string
  status: string
  submitted_at: string
}

/** Хто вже подав анкету в поточному зборі (будь-яка версія, окрім відхиленої, подана після `since`). */
export function filledStudentIds(profiles: ProfileStamp[], since: Date | null): Set<string> {
  return new Set(
    profiles
      .filter((p) => p.status !== 'rejected' && (!since || new Date(p.submitted_at).getTime() >= since.getTime()))
      .map((p) => p.student_id),
  )
}

export interface NotFilledGroup {
  key: string
  title: string
  students: StudentRow[]
}

/** Активні учні, які ще не заповнили, згруповані за поверхом кімнати; нерозподілені — окремо. */
export function notFilledByFloor(students: StudentRow[], filled: Set<string>): NotFilledGroup[] {
  const rest = students.filter((s) => s.status === 'active' && !filled.has(s.id))
  const byName = (a: StudentRow, b: StudentRow) => fullName(a).localeCompare(fullName(b), 'uk')
  const groups: NotFilledGroup[] = [2, 3, 4, 5].map((f) => ({
    key: String(f), title: `${f} поверх`, students: rest.filter((s) => s.floor === f).sort(byName),
  }))
  groups.push({ key: 'none', title: 'Без кімнати', students: rest.filter((s) => s.floor == null).sort(byName) })
  return groups.filter((g) => g.students.length > 0)
}

export function shareMessage(link: string, expiresAt: string): string {
  const d = new Date(expiresAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
  return `Привіт! Заповніть, будь ласка, анкету мешканця гуртожитку (кожен — свою, ПІБ і дату народження пишіть як у документах). Посилання діє до ${d}: ${link}`
}

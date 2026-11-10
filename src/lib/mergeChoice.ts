import { SOCIAL_OPTIONS } from '../../supabase/functions/_shared/questionnaire.ts'
import type { FieldDiff } from './diff'

/** Що вихователь залишає для поля: стару відповідь, нову або обидві (через кому). */
export interface Choice {
  old: boolean
  new: boolean
}
export type ChoiceKind = 'old' | 'new' | 'both'

/** Вільний текст, де «стара, нова» має сенс. Решта (телефони, дата, група, ПІБ…) — лише одне значення. */
export const MERGEABLE = new Set([
  'social_status', 'address', 'school_activities', 'college_plans', 'class_teacher', 'master', 'allergies', 'chronic_conditions',
])

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** За замовчуванням — нове; якщо нове порожнє, а старе є — лишаємо старе. */
export function defaultChoice(before: string, after: string): Choice {
  return !norm(after) && norm(before) ? { old: true, new: false } : { old: false, new: true }
}

/**
 * Перемикання галочки. Завжди лишається хоча б одна. Для полів, де об'єднання немає сенсу
 * (телефон, дата…), вибір стає або старим, або новим.
 */
export function toggleChoice(c: Choice, side: 'old' | 'new', mergeable: boolean): Choice {
  if (!mergeable) return side === 'old' ? { old: true, new: false } : { old: false, new: true }
  const next = { ...c, [side]: !c[side] }
  return next.old || next.new ? next : c
}

/** Підсумкове значення: вибрані непорожні частини «стара, нова» без повторів. */
export function mergedValue(before: string, after: string, c: Choice): string {
  const parts: string[] = []
  for (const [on, v] of [[c.old, before], [c.new, after]] as const) {
    const t = norm(v)
    if (on && t && !parts.some((p) => p.toLowerCase() === t.toLowerCase())) parts.push(t)
  }
  return parts.join(', ')
}

export const choiceKind = (c: Choice): ChoiceKind => (c.old && c.new ? 'both' : c.old ? 'old' : 'new')

export interface MergePlan {
  /** значення полів, які змінено (лише вони передаються на сервер) */
  values: Record<string, string>
  /** як вирішено кожне змінене поле */
  choices: Record<string, ChoiceKind>
  oldCount: number
  newCount: number
  bothCount: number
}

/** Зводить вибір по змінених рядках у план для `approve_student_profile_merged`. */
export function buildPlan(rows: FieldDiff[], choices: Record<string, Choice>): MergePlan {
  const plan: MergePlan = { values: {}, choices: {}, oldCount: 0, newCount: 0, bothCount: 0 }
  for (const r of rows) {
    if (!r.changed) continue
    const c = choices[r.key] ?? defaultChoice(r.before, r.after)
    const kind = choiceKind(c)
    plan.values[r.key] = mergedValue(r.before, r.after, c)
    plan.choices[r.key] = kind
    if (kind === 'old') plan.oldCount++
    else if (kind === 'both') plan.bothCount++
    else plan.newCount++
  }
  return plan
}

export interface SocialData {
  codes?: unknown
  children_count?: unknown
  ato?: unknown
  zsu?: unknown
}

/** Структурований соціальний статус за вибором: стара, нова або об'єднання кодів (деталі — з нової, якщо є). */
export function mergeSocialData(oldD: SocialData | null, newD: SocialData | null, kind: ChoiceKind): SocialData | null {
  if (kind === 'new') return newD
  if (kind === 'old') return oldD
  const codes = (d: SocialData | null) => (Array.isArray(d?.codes) ? (d.codes as string[]) : [])
  const all = new Set([...codes(oldD), ...codes(newD)])
  if (all.size > 1) all.delete('none')
  const merged: SocialData = { codes: SOCIAL_OPTIONS.map((o) => o.code as string).filter((c) => all.has(c)) }
  for (const k of ['children_count', 'ato', 'zsu'] as const) {
    const v = newD?.[k] ?? oldD?.[k]
    if (v != null && v !== '') merged[k] = v
  }
  return merged
}

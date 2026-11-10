import type { FieldErrors, QuestionnaireData } from '../../supabase/functions/_shared/questionnaire.ts'

const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export interface QuestionnairePrefill {
  /** personal — персональне посилання (є підстановка); shared — спільне посилання поверху (порожня форма). */
  mode: 'personal' | 'shared'
  /** Перелік професій для вибору (порожній — вводити текстом) */
  professions?: string[]
  full_name: string
  birth_date: string | null
  room: string | null
  profile:
    | (Partial<Record<keyof QuestionnaireData, string | null>> & {
        social_status_data?: { codes?: unknown[]; children_count?: string | number; ato?: string; zsu?: string } | null
      })
    | null
}

export type GetResult =
  | { kind: 'ok'; data: QuestionnairePrefill }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string }

export type SubmitResult =
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'validation'; fields: FieldErrors }
  | { kind: 'rate_limited' }
  | { kind: 'error' }

async function call(fn: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
  if (!base || !key) throw new Error('config')
  const res = await fetch(`${base}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify(body),
  })
  let json: Record<string, unknown> | null = null
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    /* не JSON */
  }
  return { status: res.status, json }
}

/** Будь-яка причина недійсного посилання (невідоме / прострочене / використане) → однаковий результат 'invalid'. */
export async function getQuestionnaire(token: string): Promise<GetResult> {
  try {
    const { status, json } = await call('get-questionnaire', { token })
    if (status === 200 && json?.ok === true) return { kind: 'ok', data: json as unknown as QuestionnairePrefill }
    if (status === 404 || status === 400) return { kind: 'invalid' }
    return { kind: 'error', message: status === 429 ? 'Забагато спроб. Спробуй за кілька хвилин.' : 'Сервіс тимчасово недоступний.' }
  } catch {
    return { kind: 'error', message: 'Немає зʼєднання. Перевір інтернет і онови сторінку.' }
  }
}

export async function submitQuestionnaire(token: string, answers: QuestionnaireData): Promise<SubmitResult> {
  try {
    const { status, json } = await call('submit-questionnaire', { token, answers })
    if (status === 200 && json?.ok === true) return { kind: 'ok' }
    if (status === 404) return { kind: 'invalid' }
    if (status === 400 && json?.error === 'validation') return { kind: 'validation', fields: (json.fields ?? {}) as FieldErrors }
    if (status === 429) return { kind: 'rate_limited' }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

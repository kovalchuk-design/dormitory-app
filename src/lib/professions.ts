/** Значення «Інша» у виборі професії (учень вводить назву сам). */
export const OTHER = '__other'

/** Порівняння професій: регістр, пробіли, різні апострофи, крапка в кінці. */
export const normProf = (s: string): string =>
  s.toLowerCase().replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().replace(/\.$/, '')

/** «… — на базі 9 класів» → «…» (старі анкети зберігали професію без освітньої бази). */
export const stripBase = (s: string): string => s.replace(/\s*[—-]\s*на базі \d+ класів\s*$/i, '')

/** Який варіант обрано для збереженого значення: назва зі списку (з правильним регістром), «Інша» або нічого. */
export function professionChoice(value: string, list: string[]): string {
  const v = normProf(value)
  if (!v) return ''
  const hit = list.find((p) => normProf(p) === v)
  if (hit) return hit
  // стара відповідь без «на базі…»: якщо їй відповідає рівно одна позиція списку — обираємо її
  const loose = list.filter((p) => normProf(stripBase(p)) === v)
  return loose.length === 1 ? loose[0] : OTHER
}

export interface ProfessionSuggestion {
  name: string
  count: number
}

/**
 * Що вводили учні, але чого немає в переліку: групуємо за нормалізованим написанням,
 * показуємо найчастіший варіант і кількість. Для адміністратора — «Додати в список».
 */
export function suggestProfessions(rows: { profession: string | null }[], catalog: string[], limit = 30): ProfessionSuggestion[] {
  const known = new Set(catalog.flatMap((c) => [normProf(c), normProf(stripBase(c))]))
  const groups = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const raw = (r.profession ?? '').replace(/\s+/g, ' ').trim()
    const key = normProf(raw)
    if (!key || known.has(key)) continue
    const variants = groups.get(key) ?? new Map<string, number>()
    variants.set(raw, (variants.get(raw) ?? 0) + 1)
    groups.set(key, variants)
  }
  return [...groups.values()]
    .map((variants) => {
      const sorted = [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
      return { name: sorted[0][0], count: [...variants.values()].reduce((a, b) => a + b, 0) }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'))
    .slice(0, limit)
}

/** Наступний порядковий номер для нової професії (крок 10, щоб було місце для ручного впорядкування). */
export function nextSortOrder(rows: { sort_order: number }[]): number {
  return rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 10 : 10
}

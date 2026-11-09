export const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
]

export interface DateParts {
  d: string
  m: string
  y: string
}

/** YYYY-MM-DD → частини (порожні, якщо значення не схоже на дату). */
export function splitIsoDate(iso: string): DateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) } : { d: '', m: '', y: '' }
}

/** Три вибори → YYYY-MM-DD; поки обрано не все — порожній рядок. Неіснуючі дати (31 лютого) не відсікаються тут: це робить валідація. */
export function joinDateParts(p: DateParts): string {
  if (!p.d || !p.m || !p.y) return ''
  return `${p.y}-${p.m.padStart(2, '0')}-${p.d.padStart(2, '0')}`
}

export const isPartialDate = (p: DateParts): boolean => [p.d, p.m, p.y].some(Boolean) && ![p.d, p.m, p.y].every(Boolean)

/** Роки від найновішого до найстарішого; рік із наявного значення завжди присутній у списку. */
export function yearOptions(minYear: number, maxYear: number, current?: string): number[] {
  const years: number[] = []
  for (let y = maxYear; y >= minYear; y--) years.push(y)
  const c = Number(current)
  if (c && !years.includes(c)) years.push(c)
  return years.sort((a, b) => b - a)
}

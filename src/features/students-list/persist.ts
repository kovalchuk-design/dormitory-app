import type { Filters } from '../../lib/studentsList'
import { DEFAULT_FILTERS } from '../../lib/studentsList'

const KEY = 'students-filters-v1'

/** Фільтри списку переживають перехід до картки/редагування і назад (у межах вкладки). */
export function loadFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return DEFAULT_FILTERS
    const p = JSON.parse(raw) as Partial<Filters>
    return {
      ...DEFAULT_FILTERS,
      query: typeof p.query === 'string' ? p.query : '',
      grade: typeof p.grade === 'string' ? p.grade : '',
      room: typeof p.room === 'string' ? p.room : '',
      status: typeof p.status === 'string' ? p.status : DEFAULT_FILTERS.status,
      floors: Array.isArray(p.floors) ? p.floors.filter((x): x is number => typeof x === 'number') : [],
      social: Array.isArray(p.social) ? p.social.filter((x): x is string => typeof x === 'string') : [],
      unplacedOnly: p.unplacedOnly === true,
      notesOnly: p.notesOnly === true,
    }
  } catch { return DEFAULT_FILTERS }
}

export function saveFilters(f: Filters): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(f)) } catch { /* приватний режим — не критично */ }
}

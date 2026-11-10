import { useSyncExternalStore } from 'react'
import { DEFAULT_FILTERS, type Filters, type StudentRow } from '../../lib/studentsList'

/** Той самий поріг, що й у CSS оболонки (shell.css): телефон / низька ландшафтна орієнтація. */
export const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)'

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

/** Другий рядок у списку: «4 пов. · к. 412 · гр. 21»; для нерозподіленого перша частина — «без кімнати». */
export function placementParts(r: Pick<StudentRow, 'floor' | 'room' | 'group_number'>): { text: string; unplaced: boolean }[] {
  const parts: { text: string; unplaced: boolean }[] = []
  if (r.room == null) parts.push({ text: 'без кімнати', unplaced: true })
  else {
    if (r.floor != null) parts.push({ text: `${r.floor} пов.`, unplaced: false })
    parts.push({ text: `к. ${r.room}`, unplaced: false })
  }
  if (r.group_number) parts.push({ text: `гр. ${r.group_number}`, unplaced: false })
  return parts
}

/** Скільки груп фільтрів активні (для значка на кнопці «Фільтри»): поверхи, соцстатус, примітки, нерозподілені, клас/кімната/статус. Пошук не рахується. */
export function activeFilterCount(f: Filters): number {
  return (
    (f.floors.length > 0 ? 1 : 0) +
    (f.social.length > 0 ? 1 : 0) +
    (f.notesOnly ? 1 : 0) +
    (f.unplacedOnly ? 1 : 0) +
    (f.grade !== DEFAULT_FILTERS.grade ? 1 : 0) +
    (f.room !== DEFAULT_FILTERS.room ? 1 : 0) +
    (f.status !== DEFAULT_FILTERS.status ? 1 : 0)
  )
}

/** Чи відрізняється стан від початкового (враховує і пошук) — для кнопки «Скинути». */
export function isFiltersDirty(f: Filters): boolean {
  return f.query.trim() !== '' || activeFilterCount(f) > 0
}

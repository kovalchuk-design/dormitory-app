import type { AcademicYear, DocumentRow } from './types'

/** Тема/категорія, за якою користувач шукає попередні документи. */
export interface TopicSelection {
  category: string
  topic: string
}

/**
 * Попередні документи за темою (якщо тема не вказана — за категорією).
 * Найновіші навчальні роки першими; усередині року — найновіші завантаження.
 */
export function candidatesForTopic(
  docs: DocumentRow[],
  sel: TopicSelection,
  years: AcademicYear[],
): DocumentRow[] {
  if (!sel.topic && !sel.category) return []
  const yearName = new Map(years.map((y) => [y.id, y.name]))
  return docs
    .filter((d) => (sel.topic ? d.topic === sel.topic : d.category === sel.category))
    .filter((d) => !sel.category || !sel.topic || d.category === sel.category || d.category == null)
    .sort((a, b) => {
      const ya = yearName.get(a.academic_year_id ?? '') ?? ''
      const yb = yearName.get(b.academic_year_id ?? '') ?? ''
      return yb.localeCompare(ya) || b.created_at.localeCompare(a.created_at)
    })
}

/** Прибирає з назви хвіст на кшталт «2023/2024» чи «(2023-2024)» і додає поточний рік. */
export function defaultBasedOnTitle(sourceTitle: string, yearName: string | null): string {
  const base = sourceTitle
    .replace(/\s*[([]?\s*\d{4}\s*[/\-–—]\s*\d{2,4}\s*[)\]]?\s*$/u, '')
    .trim()
  const title = base || sourceTitle.trim()
  return yearName ? `${title} (${yearName})` : title
}

// ---- стан сценарію «Створити на основі…» ------------------------------------

export type Step = 'pick' | 'preview' | 'confirm' | 'done'

export interface BasedOnState {
  step: Step
  category: string
  topic: string
  sourceId: string | null
  title: string
  createdId: string | null
}

export const INITIAL_BASED_ON: BasedOnState = {
  step: 'pick',
  category: '',
  topic: '',
  sourceId: null,
  title: '',
  createdId: null,
}

export type BasedOnAction =
  | { type: 'setTopic'; category: string; topic: string }
  | { type: 'openPreview'; sourceId: string }
  | { type: 'backToList' }
  | { type: 'accept'; title: string }
  | { type: 'setTitle'; title: string }
  | { type: 'created'; documentId: string }
  | { type: 'reset' }

export function basedOnReducer(state: BasedOnState, a: BasedOnAction): BasedOnState {
  switch (a.type) {
    case 'setTopic':
      // зміна теми скидає вибраний документ
      return { ...INITIAL_BASED_ON, category: a.category, topic: a.topic }
    case 'openPreview':
      return { ...state, step: 'preview', sourceId: a.sourceId, title: '', createdId: null }
    case 'backToList':
      return state.step === 'done' ? state : { ...state, step: 'pick', sourceId: null, title: '' }
    case 'accept':
      return state.step === 'preview' && state.sourceId ? { ...state, step: 'confirm', title: a.title } : state
    case 'setTitle':
      return state.step === 'confirm' ? { ...state, title: a.title } : state
    case 'created':
      return state.step === 'confirm' ? { ...state, step: 'done', createdId: a.documentId } : state
    case 'reset':
      return INITIAL_BASED_ON
  }
}

export function canCreate(state: BasedOnState): boolean {
  return state.step === 'confirm' && !!state.sourceId && state.title.trim().length > 0
}

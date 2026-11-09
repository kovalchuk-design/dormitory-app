import { useCallback, useEffect, useReducer, useState } from 'react'
import { loadLibrary, type Library } from './api'
import { ArchiveTab } from './ArchiveTab'
import { basedOnReducer, INITIAL_BASED_ON } from './basedOn'
import { BasedOnTab } from './BasedOnTab'
import { TemplatesTab } from './TemplatesTab'
import type { DocumentRow } from './types'
import './documents.css'

type Tab = 'archive' | 'based' | 'templates'
const TABS: { id: Tab; label: string }[] = [
  { id: 'archive', label: 'Архів' },
  { id: 'based', label: 'Створити на основі…' },
  { id: 'templates', label: 'Шаблони й автозаповнення' },
]

export function DocumentsPage() {
  const [tab, setTab] = useState<Tab>('archive')
  const [lib, setLib] = useState<Library | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [basedOn, dispatch] = useReducer(basedOnReducer, INITIAL_BASED_ON)

  const reload = useCallback(async () => {
    try {
      setLib(await loadLibrary())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    loadLibrary().then(
      (l) => !cancelled && setLib(l),
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  function startFrom(doc: DocumentRow) {
    dispatch({ type: 'setTopic', category: doc.category ?? '', topic: doc.topic ?? '' })
    dispatch({ type: 'openPreview', sourceId: doc.id })
    setTab('based')
  }

  return (
    <section className="documents">
      <h1>Документи</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {!lib && !error && <p className="muted">Завантаження…</p>}
      {lib && tab === 'archive' && <ArchiveTab lib={lib} reload={reload} onBasedOn={startFrom} />}
      {lib && tab === 'based' && <BasedOnTab lib={lib} reload={reload} state={basedOn} dispatch={dispatch} />}
      {lib && tab === 'templates' && <TemplatesTab lib={lib} />}
    </section>
  )
}

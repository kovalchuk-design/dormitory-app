import { useCallback, useEffect, useState } from 'react'
import { loadLibrary, type Library } from './api'
import { ArchiveTab } from './ArchiveTab'
import { TemplatesTab } from './TemplatesTab'
import './documents.css'

type Tab = 'templates' | 'archive'
const TABS: { id: Tab; label: string; more?: string }[] = [
  { id: 'templates', label: 'Шаблони', more: ' й автозаповнення' },
  { id: 'archive', label: 'Архів' },
]

export function DocumentsPage() {
  const [tab, setTab] = useState<Tab>('templates')
  const [lib, setLib] = useState<Library | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <section className="documents">
      <div className="hostel-head">
        <h1>Документи</h1>
        <div className="view-switch" role="tablist" aria-label="Розділи документів">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.more && <span className="ph-hide">{t.more}</span>}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!lib && !error && <p className="muted">Завантаження…</p>}
      {lib && tab === 'archive' && <ArchiveTab lib={lib} reload={reload} />}
      {lib && tab === 'templates' && <TemplatesTab lib={lib} />}
    </section>
  )
}

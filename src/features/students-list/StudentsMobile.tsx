import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/ui/icons'
import { fullName } from '../../lib/format'
import { DEFAULT_FILTERS, SOCIAL_FILTERS, type Filters, type StudentRow } from '../../lib/studentsList'
import { activeFilterCount, isFiltersDirty, placementParts } from './logic'
import './studentsList.css'

const FLOORS = [2, 3, 4, 5]

interface Props {
  filters: Filters
  setFilters: (f: Filters | ((p: Filters) => Filters)) => void
  rows: StudentRow[]
  total: number
  onOpen: (id: string) => void
  openId: string | null
}

/** Мобільний вигляд «Студентів»: липка панель пошуку/фільтрів + компактний список «один учень — один рядок». */
export function StudentsMobile({ filters, setFilters, rows, total, onOpen, openId }: Props) {
  const [sheet, setSheet] = useState(false)
  const count = activeFilterCount(filters)
  const dirty = isFiltersDirty(filters)
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const toggleFloor = (n: number) => set('floors', filters.floors.includes(n) ? filters.floors.filter((x) => x !== n) : [...filters.floors, n])

  return (
    <>
      <div className="sl-bar">
        <form className="sl-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label className="sr-only" htmlFor="sl-q">Пошук</label>
          <input id="sl-q" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
            value={filters.query} onChange={(e) => set('query', e.target.value)} placeholder="Пошук учня" />
          <button type="button" className="sl-filter-btn" aria-haspopup="dialog" onClick={() => setSheet(true)}>
            <Icon name="filter" size={18} />
            <span>Фільтри</span>
            {count > 0 && <span className="sl-badge" aria-label={`Активних фільтрів: ${count}`}>{count}</span>}
          </button>
        </form>
        <div className="sl-chips" role="group" aria-label="Швидкі фільтри">
          {FLOORS.map((f) => (
            <button key={f} type="button" className={`sl-chip${filters.floors.includes(f) ? ' on' : ''}`} aria-pressed={filters.floors.includes(f)}
              onClick={() => toggleFloor(f)}>{f} пов.</button>
          ))}
          <button type="button" className={`sl-chip${filters.unplacedOnly ? ' on' : ''}`} aria-pressed={filters.unplacedOnly}
            onClick={() => set('unplacedOnly', !filters.unplacedOnly)}>Нерозподілені</button>
        </div>
        <div className="sl-count" aria-live="polite">
          <span>Знайдено {rows.length} з {total}</span>
          {dirty && <button type="button" className="sl-reset" onClick={() => setFilters(DEFAULT_FILTERS)}>Скинути</button>}
        </div>
      </div>

      <div className="sl-scroll">
      {rows.length === 0 ? (
        <div className="sl-empty">
          <p>Нікого не знайдено.</p>
          {dirty && <button type="button" className="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Скинути фільтри</button>}
        </div>
      ) : (
        <ul className="sl-list" aria-label="Учні">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/students/${r.id}`} className={`sl-row${openId === r.id ? ' is-open' : ''}`}
                onClick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onOpen(r.id) } }}>
                <span className="sl-name">{fullName(r)}</span>
                <span className="sl-sub">
                  {placementParts(r).map((p, i) => (
                    <span key={i} className={p.unplaced ? 'sl-unplaced' : undefined}>{i > 0 && ' · '}{p.text}</span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>

      {sheet && <FiltersSheet filters={filters} setFilters={setFilters} shown={rows.length} onClose={() => setSheet(false)} />}
    </>
  )
}

function FiltersSheet({ filters, setFilters, shown, onClose }: { filters: Filters; setFilters: Props['setFilters']; shown: number; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])
  const toggleSocial = (code: string) =>
    setFilters((f) => ({ ...f, social: f.social.includes(code) ? f.social.filter((x) => x !== code) : [...f.social, code] }))
  const toggleFloor = (n: number) =>
    setFilters((f) => ({ ...f, floors: f.floors.includes(n) ? f.floors.filter((x) => x !== n) : [...f.floors, n] }))

  return (
    <div className="sl-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="sl-sheet" role="dialog" aria-modal="true" aria-label="Фільтри" tabIndex={-1}>
        <div className="sl-sheet-head">
          <strong>Фільтри</strong>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
        </div>
        <div className="sl-sheet-body">
          <fieldset>
            <legend>Поверх</legend>
            <div className="sl-sheet-chips">
              {FLOORS.map((f) => (
                <button key={f} type="button" className={`sl-chip${filters.floors.includes(f) ? ' on' : ''}`} aria-pressed={filters.floors.includes(f)}
                  onClick={() => toggleFloor(f)}>{f}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Додатково</legend>
            <label className="sl-check"><input type="checkbox" checked={filters.unplacedOnly} onChange={(e) => setFilters((f) => ({ ...f, unplacedOnly: e.target.checked }))} /> Нерозподілені</label>
            <label className="sl-check"><input type="checkbox" checked={filters.notesOnly} onChange={(e) => setFilters((f) => ({ ...f, notesOnly: e.target.checked }))} /> З примітками</label>
          </fieldset>
          <fieldset>
            <legend>Соціальний статус</legend>
            {SOCIAL_FILTERS.map((o) => (
              <label key={o.code} className="sl-check"><input type="checkbox" checked={filters.social.includes(o.code)} onChange={() => toggleSocial(o.code)} /> {o.label}</label>
            ))}
          </fieldset>
        </div>
        <div className="sl-sheet-foot">
          <button type="button" className="secondary" disabled={!isFiltersDirty(filters)} onClick={() => setFilters(DEFAULT_FILTERS)}>Скинути</button>
          <button type="button" onClick={onClose}>Показати: {shown}</button>
        </div>
      </div>
    </div>
  )
}

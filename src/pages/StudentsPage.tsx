import { useContext, useEffect, useMemo, useState } from 'react'
import { HostelExportRegistry, HostelStudentCard } from './hostelContext'
import { Link } from 'react-router-dom'
import { ScrollArea } from '../components/ui/ScrollArea'
import { fullName, STATUS_LABELS } from '../lib/format'
import { fetchStudentRows } from '../lib/studentsApi'
import {
  DEFAULT_FILTERS, filterStudents, sortStudents,
  type Filters, type SortDir, type SortKey,
} from '../lib/studentsList'
import { useLoad } from '../lib/useLoad'
import { Select } from '../components/ui/Select'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'ПІБ' },
  { key: 'floor', label: 'Поверх' },
  { key: 'room', label: 'Кімната' },
  { key: 'group', label: 'Група' },
]

/** Індикатор сортування фіксованої ширини: завжди видно, що за колонкою можна сортувати; активний напрям підсвічено, сусідні колонки не зсуваються. */
function SortMark({ dir }: { dir: SortDir | null }) {
  return (
    <svg className={`sort-mark${dir ? ' on' : ''}`} width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" focusable="false">
      <path className={dir === 'asc' ? 'act' : ''} d="M5 1.5l4 4.5H1z" />
      <path className={dir === 'desc' ? 'act' : ''} d="M5 12.5L1 8h8z" />
    </svg>
  )
}

export function StudentsPage() {
  const { data, error, loading } = useLoad(fetchStudentRows, 'students')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const { openId, open: setOpenId } = useContext(HostelStudentCard)
  const registerExport = useContext(HostelExportRegistry)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })

  const rooms = useMemo(
    () => [...new Set((data ?? []).map((r) => r.room).filter((r): r is string => r != null))].sort((a, b) => a.localeCompare(b, 'uk', { numeric: true })),
    [data],
  )
  const rows = useMemo(() => sortStudents(filterStudents(data ?? [], filters), sort.key, sort.dir), [data, filters, sort])
  useEffect(() => {
    registerExport?.(() => rows)
    return () => registerExport?.(null)
  }, [registerExport, rows])
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <section className="fill-page st-page">
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()} aria-label="Пошук і фільтри">
        <label className="grow">Пошук (ПІБ, телефон, кімната)
          <input type="search" value={filters.query} onChange={(e) => set('query', e.target.value)} placeholder="Іваненко, 067… або 305" />
        </label>
        <button type="button" className="secondary filters-toggle" aria-expanded={showFilters} aria-controls="filters-extra"
          onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Сховати фільтри' : 'Фільтри'}
        </button>
        <div id="filters-extra" className={`filters-extra${showFilters ? ' open' : ''}`}>
        <label>Поверх
          <Select value={filters.floor} onChange={(e) => set('floor', e.target.value)}>
            <option value="">Усі</option>
            {[2, 3, 4, 5].map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </label>
        <label>Кімната
          <Select value={filters.room} onChange={(e) => set('room', e.target.value)}>
            <option value="">Усі</option>
            {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </label>
        <label>Статус
          <Select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Усі</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.notesOnly} onChange={(e) => set('notesOnly', e.target.checked)} />
          З примітками
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.unplacedOnly} onChange={(e) => set('unplacedOnly', e.target.checked)} />
          Нерозподілені
        </label>
        <button type="button" className="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Скинути</button>
        </div>
      </form>

      {loading && <p className="muted">Завантаження…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <>
          <p className="muted small" aria-live="polite">Знайдено: {rows.length} з {data.length}</p>
          {rows.length === 0 ? <p className="muted">Нікого не знайдено.</p> : (
            <ScrollArea className="st-scroll" body="st-body" head={44}>
              <table className="data cards-on-mobile">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="th-btn" onClick={() => toggleSort(c.key)}>
                          {c.label}
                          <SortMark dir={sort.key === c.key ? sort.dir : null} />
                        </button>
                      </th>
                    ))}
                    <th scope="col">Соціальний статус</th>
                    <th scope="col">Примітки</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={openId === r.id ? 'is-open' : undefined}>
                      <td data-label="ПІБ">
                        <Link to={`/students/${r.id}`} onClick={(e) => {
                          // звичайний клік — шухляда збоку; Ctrl/Cmd/Shift-клік і середня кнопка відкривають окрему сторінку
                          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); setOpenId(r.id) }
                        }}>{fullName(r)}</Link>
                      </td>
                      <td data-label="Поверх">{r.floor ?? '—'}</td>
                      <td data-label="Кімната">{r.room ?? <span className="tag tag-unplaced">нерозподілений</span>}</td>
                      <td data-label="Група">{r.group_number ?? '—'}</td>
                      <td data-label="Соц. статус" className="cell-text">{r.social_status ?? <span className="muted">—</span>}</td>
                      <td data-label="Примітки" className="cell-text cell-notes">{r.notes?.trim() ? r.notes : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </>
      )}
    </section>
  )
}

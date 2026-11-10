import { useContext, useEffect, useMemo, useState } from 'react'
import { HostelExportRegistry, HostelStudentCard } from './hostelContext'
import { Link } from 'react-router-dom'
import { Icon } from '../components/ui/icons'
import { MultiSelect } from '../components/ui/MultiSelect'
import { ScrollArea } from '../components/ui/ScrollArea'
import { fullName } from '../lib/format'
import { fetchStudentRows } from '../lib/studentsApi'
import {
  DEFAULT_FILTERS, filterStudents, SOCIAL_FILTERS, sortStudents,
  type Filters, type SortDir, type SortKey,
} from '../lib/studentsList'
import { useLoad } from '../lib/useLoad'

/** Пункти списку «Соціальний статус»: категорії + дві додаткові умови (примітки, нерозподілені). */
const SOCIAL_OPTIONS_UI = [
  ...SOCIAL_FILTERS.map((o) => ({ value: o.code, label: o.label })),
  { value: 'notes', label: 'З примітками', group: 'Додатково' },
  { value: 'unplaced', label: 'Нерозподілені', group: 'Додатково' },
]

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

  const rows = useMemo(() => sortStudents(filterStudents(data ?? [], filters), sort.key, sort.dir), [data, filters, sort])
  useEffect(() => {
    registerExport?.(() => rows)
    return () => registerExport?.(null)
  }, [registerExport, rows])
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
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
          <div className="chip-group" role="group" aria-label="Поверх">
            <span className="chip-group-label" aria-hidden="true">Поверх</span>
            {[2, 3, 4, 5].map((f) => {
              const on = filters.floors.includes(f)
              return (
                <button key={f} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                  onClick={() => set('floors', on ? filters.floors.filter((x) => x !== f) : [...filters.floors, f])}>
                  {f}
                </button>
              )
            })}
          </div>
          <MultiSelect label="Соціальний статус" options={SOCIAL_OPTIONS_UI}
            value={[...filters.social, ...(filters.notesOnly ? ['notes'] : []), ...(filters.unplacedOnly ? ['unplaced'] : [])]}
            onChange={(v) => setFilters((f) => ({
              ...f, social: v.filter((x) => x !== 'notes' && x !== 'unplaced'), notesOnly: v.includes('notes'), unplacedOnly: v.includes('unplaced'),
            }))} />
          <button type="button" className="iconbtn reset-btn" title="Скинути фільтри" aria-label="Скинути фільтри" disabled={!dirty}
            onClick={() => setFilters(DEFAULT_FILTERS)}>
            <Icon name="reset" size={18} />
          </button>
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

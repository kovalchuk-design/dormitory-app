import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PhoneLink } from '../components/PhoneLink'
import { StatusBadge } from '../components/StatusBadge'
import { downloadCsv } from '../lib/csv'
import { fullName, STATUS_LABELS } from '../lib/format'
import { fetchStudentRows } from '../lib/studentsApi'
import {
  DEFAULT_FILTERS, filterStudents, sortStudents, studentsToCsv,
  type Filters, type SortDir, type SortKey,
} from '../lib/studentsList'
import { useLoad } from '../lib/useLoad'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'ПІБ' },
  { key: 'grade', label: 'Клас' },
  { key: 'floor', label: 'Поверх' },
  { key: 'room', label: 'Кімната' },
  { key: 'status', label: 'Статус' },
]

export function StudentsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const { data, error, loading } = useLoad(fetchStudentRows, 'students')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })

  const rooms = useMemo(
    () => [...new Set((data ?? []).map((r) => r.room).filter((r): r is string => r != null))].sort((a, b) => a.localeCompare(b, 'uk', { numeric: true })),
    [data],
  )
  const rows = useMemo(() => sortStudents(filterStudents(data ?? [], filters), sort.key, sort.dir), [data, filters, sort])
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <section>
      <div className="page-head">
        <h1>Студенти</h1>
        <div className="row">
          <button type="button" className="secondary" disabled={rows.length === 0}
            onClick={() => downloadCsv(`students-${new Date().toISOString().slice(0, 10)}.csv`, studentsToCsv(rows))}>
            Експорт CSV
          </button>
          {canEdit && <Link className="btn" to="/students/new">+ Додати учня</Link>}
        </div>
      </div>

      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()} aria-label="Пошук і фільтри">
        <label className="grow">Пошук (ПІБ, телефон, кімната)
          <input type="search" value={filters.query} onChange={(e) => set('query', e.target.value)} placeholder="Іваненко, 067… або 305" />
        </label>
        <label>Клас
          <select value={filters.grade} onChange={(e) => set('grade', e.target.value)}>
            <option value="">Усі</option>
            {[9, 10, 11].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>Поверх
          <select value={filters.floor} onChange={(e) => set('floor', e.target.value)}>
            <option value="">Усі</option>
            {[2, 3, 4, 5].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label>Кімната
          <select value={filters.room} onChange={(e) => set('room', e.target.value)}>
            <option value="">Усі</option>
            {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>Статус
          <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Усі</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.unplacedOnly} onChange={(e) => set('unplacedOnly', e.target.checked)} />
          Нерозподілені
        </label>
        <button type="button" className="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Скинути</button>
      </form>

      {loading && <p className="muted">Завантаження…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <>
          <p className="muted small" aria-live="polite">Знайдено: {rows.length} з {data.length}</p>
          {rows.length === 0 ? <p className="muted">Нікого не знайдено.</p> : (
            <div className="table-wrap">
              <table className="data cards-on-mobile">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="th-btn" onClick={() => toggleSort(c.key)}>
                          {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    ))}
                    <th scope="col">Учень</th>
                    <th scope="col">Мама</th>
                    <th scope="col">Тато</th>
                    <th scope="col">Опікун</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="ПІБ"><Link to={`/students/${r.id}`}>{fullName(r)}</Link></td>
                      <td data-label="Клас">{r.grade}</td>
                      <td data-label="Поверх">{r.floor ?? '—'}</td>
                      <td data-label="Кімната">{r.room ?? <span className="tag tag-unplaced">нерозподілений</span>}</td>
                      <td data-label="Статус"><StatusBadge status={r.status} /></td>
                      <td data-label="Учень"><PhoneLink phone={r.student_phone} label={fullName(r)} /></td>
                      <td data-label="Мама"><PhoneLink phone={r.mother_phone} label={`мама ${fullName(r)}`} /></td>
                      <td data-label="Тато"><PhoneLink phone={r.father_phone} label={`тато ${fullName(r)}`} /></td>
                      <td data-label="Опікун"><PhoneLink phone={r.guardian_phone} label={`опікун ${fullName(r)}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

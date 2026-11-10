import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Icon } from '../components/ui/icons'
import { fetchBoard, type BoardData } from '../features/rooms/api'
import { FLOORS } from '../features/rooms/logic'
import { useQueueCounts } from '../lib/pending'
import { useLoad } from '../lib/useLoad'

async function loadBoard(): Promise<BoardData> {
  const res = await fetchBoard()
  if (res.error) throw new Error(res.error.message ?? 'Не вдалося завантажити дані')
  return res.data
}

function Kpi({ label, value, hint, to, tone }: { label: string; value: number | string; hint?: string; to?: string; tone?: 'accent' | 'warn' }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </>
  )
  const cls = `kpi${tone ? ` kpi-${tone}` : ''}`
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

export function HomePage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const { data, error, loading } = useLoad(loadBoard, 'home-board')
  const counts = useQueueCounts(canEdit)

  const floors = FLOORS.map((f) => {
    const rooms = (data?.rooms ?? []).filter((r) => r.floor === f && r.isActive)
    const capacity = rooms.reduce((s, r) => s + r.capacity, 0)
    const occupied = rooms.reduce((s, r) => s + r.occupied, 0)
    return { floor: f, capacity, occupied, free: Math.max(0, capacity - occupied), pct: capacity ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0 }
  })
  const active = data ? data.placed.length + data.unplaced.length : 0

  return (
    <section className="home">
      <header className="head">
        <h1>Головна</h1>
      </header>

      <Link to="/hostel/students" className="home-search">
        <Icon name="search" />
        <span>
          <strong>Знайти учня або зателефонувати</strong>
          <small>за прізвищем, телефоном чи кімнатою</small>
        </span>
      </Link>

      {error && <p className="banner bad" role="alert">{error}</p>}
      {loading && <p className="muted">Завантаження…</p>}

      {data && (
        <div className="grid4">
          <Kpi label="Учнів активних" value={active} to="/hostel/students" />
          <Kpi label="Нерозподілені" value={data.unplaced.length} hint={data.unplaced.length ? 'потрібна кімната' : 'усі в кімнатах'}
            to="/hostel/rooms" tone={data.unplaced.length ? 'warn' : undefined} />
          {canEdit && <Kpi label="Оновлення на підтвердження" value={counts.pending} to="/updates" tone={counts.pending ? 'accent' : undefined} />}
          {canEdit && <Kpi label="Анкети без учня" value={counts.unmatched} to="/collect" tone={counts.unmatched ? 'warn' : undefined} />}
        </div>
      )}

      {data && (
        <div className="card">
          <h2>Заповненість поверхів</h2>
          <div className="grid4">
            {floors.map((f) => (
              <Link key={f.floor} to="/hostel/rooms" className="floor-tile">
                <div className="floor-tile-head">
                  <strong>{f.floor} поверх</strong>
                  <span className={`pill ${f.free === 0 ? 'warn' : 'good'}`}>{f.free === 0 ? 'Заповнено' : `Вільно ${f.free}`}</span>
                </div>
                <div className="meter" role="img" aria-label={`${f.floor} поверх: зайнято ${f.occupied} з ${f.capacity} місць`}>
                  <span style={{ width: `${f.pct}%` }} />
                </div>
                <span className="small muted">{f.occupied} із {f.capacity} місць</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

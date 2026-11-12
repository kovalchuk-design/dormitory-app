import { useMemo } from 'react'
import { ScrollArea } from '../../components/ui/ScrollArea'
import { compareRooms } from './logic'
import { useRoomsBoard } from './useRoomsBoard'

/** Режим «Тривога»: лише кімнати, одна за одною, без учнів, пулу нерозподілених і налаштувань. */
export function AlarmRooms() {
  const { data, error, loading } = useRoomsBoard()
  const rooms = useMemo(() => [...(data?.rooms ?? [])].sort(compareRooms), [data])
  if (loading) return <p className="muted">Завантаження…</p>
  if (error) return <p className="error" role="alert">{error}</p>
  return (
    <ScrollArea className="alarm-scroll" body="alarm-body" inset={8}>
      <ul className="alarm-list" aria-label="Кімнати">
        {rooms.map((r) => (
          <li key={r.id} className={`alarm-room${r.isActive ? '' : ' off'}`}>
            <strong className="alarm-num">{r.number}</strong>
            <span className="alarm-floor">{r.floor} поверх</span>
            <span className="alarm-occ">{r.isActive ? `${r.occupied}/${r.capacity}` : 'не діє'}</span>
          </li>
        ))}
        {rooms.length === 0 && <li className="muted">Кімнат немає.</li>}
      </ul>
    </ScrollArea>
  )
}

import type { PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '../../components/ui/icons'
import { PupilChip } from './PupilChip'
import { capacityOptions, roomState, type Pupil, type RoomInfo } from './logic'
import { Select } from '../../components/ui/Select'

export type DropHint = 'ok' | 'blocked' | null

interface Props {
  room: RoomInfo
  pupils: Pupil[]
  canEdit: boolean
  isAdmin: boolean
  hint: DropHint
  isOver: boolean
  draggingId: string | null
  onDragStart: (e: ReactPointerEvent, pupil: Pupil, roomId: string | null) => void
  onMove: (p: Pupil, roomId: string | null) => void
  onHistory: (p: Pupil) => void
  onRoomHistory: (r: RoomInfo) => void
  onEdit: (r: RoomInfo) => void
  onCapacity: (r: RoomInfo, capacity: number) => void
}

export function RoomCard({ room, pupils, canEdit, isAdmin, hint, isOver, draggingId, onDragStart, onMove, onHistory, onRoomHistory, onEdit, onCapacity }: Props) {
  const state = roomState(room)
  const cls = ['rm-room', `is-${state}`, hint === 'ok' && 'hint-ok', hint === 'blocked' && 'hint-blocked', isOver && 'over']
    .filter(Boolean)
    .join(' ')
  return (
    <section data-drop={`room:${room.id}`} className={cls} aria-label={`Кімната ${room.number}`} data-testid={`room-${room.number}`}>
      <header>
        <strong>{room.number}</strong>
        <span className={`rm-badge ${state}`} data-testid={`occ-${room.number}`}>
          {state === 'inactive' ? 'неактивна' : `${room.occupied}/${room.capacity}`}
        </span>
        <span className="rm-actions">
          <button type="button" className="iconbtn quiet" title="Історія кімнати" aria-label={`Історія кімнати ${room.number}`} onClick={() => onRoomHistory(room)}>
            <Icon name="history" size={16} />
          </button>
          {isAdmin && (
            <button type="button" className="iconbtn quiet" title="Налаштування кімнати" aria-label={`Налаштування кімнати ${room.number}`} onClick={() => onEdit(room)}>
              <Icon name="gear" size={16} />
            </button>
          )}
        </span>
      </header>
      {state !== 'inactive' && (
        <div className="meter rm-meter" aria-hidden="true">
          <span style={{ width: `${room.capacity ? Math.min(100, (room.occupied / room.capacity) * 100) : 0}%` }} />
        </div>
      )}
      {canEdit && state !== 'inactive' && (
        <label className="rm-cap">
          Місць:
          <Select className="sm"
            value={room.capacity}
            aria-label={`Максимум місць у кімнаті ${room.number}`}
            onChange={(e) => onCapacity(room, Number(e.target.value))}
          >
            {capacityOptions(room.capacity, room.occupied).map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>{o.value}</option>
            ))}
          </Select>
        </label>
      )}
      <ul>
        {pupils.map((p) => (
          <PupilChip key={p.id} pupil={p} roomId={room.id} canEdit={canEdit} dragging={draggingId === p.id} onDragStart={onDragStart} onMove={onMove} onHistory={onHistory} />
        ))}
        {pupils.length === 0 && <li className="muted small">порожня</li>}
      </ul>
    </section>
  )
}

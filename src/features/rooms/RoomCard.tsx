import { useDroppable } from '@dnd-kit/core'
import { PupilChip } from './PupilChip'
import { roomState, type Pupil, type RoomInfo } from './logic'

export type DropHint = 'ok' | 'blocked' | null

interface Props {
  room: RoomInfo
  pupils: Pupil[]
  canEdit: boolean
  hint: DropHint
  onMove: (p: Pupil, roomId: string | null) => void
  onHistory: (p: Pupil) => void
  onRoomHistory: (r: RoomInfo) => void
  onEdit: (r: RoomInfo) => void
}

export function RoomCard({ room, pupils, canEdit, hint, onMove, onHistory, onRoomHistory, onEdit }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `room:${room.id}`, data: { kind: 'room', roomId: room.id } })
  const state = roomState(room)
  const cls = ['rm-room', `is-${state}`, hint === 'ok' && 'hint-ok', hint === 'blocked' && 'hint-blocked', isOver && 'over']
    .filter(Boolean)
    .join(' ')
  return (
    <section ref={setNodeRef} className={cls} aria-label={`Кімната ${room.number}`} data-testid={`room-${room.number}`}>
      <header>
        <strong>{room.number}</strong>
        <span className={`rm-badge ${state}`} data-testid={`occ-${room.number}`}>
          {state === 'inactive' ? 'неактивна' : `${room.occupied}/${room.capacity}`}
        </span>
        <span className="rm-actions">
          <button type="button" className="secondary rm-mini" title="Історія кімнати" aria-label={`Історія кімнати ${room.number}`} onClick={() => onRoomHistory(room)}>
            🕘
          </button>
          {canEdit && (
            <button type="button" className="secondary rm-mini" title="Налаштування кімнати" aria-label={`Налаштування кімнати ${room.number}`} onClick={() => onEdit(room)}>
              ⚙
            </button>
          )}
        </span>
      </header>
      <ul>
        {pupils.map((p) => (
          <PupilChip key={p.id} pupil={p} roomId={room.id} canEdit={canEdit} onMove={onMove} onHistory={onHistory} />
        ))}
        {pupils.length === 0 && <li className="muted small">порожня</li>}
      </ul>
    </section>
  )
}

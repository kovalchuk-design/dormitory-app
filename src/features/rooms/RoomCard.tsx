import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '../../components/ui/icons'
import { PupilChip } from './PupilChip'
import { roomState, type Pupil, type RoomInfo } from './logic'

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
  onEdit: (r: RoomInfo) => void
  /** Режим «Тривога»: картка згорнута, розкривається клацанням; без налаштувань і перетягування. */
  alarm?: boolean
}

export function RoomCard({ room, pupils, canEdit, isAdmin, hint, isOver, draggingId, onDragStart, onMove, onEdit, alarm }: Props) {
  const [open, setOpen] = useState(false)
  const state = roomState(room)
  const cls = ['rm-room', `is-${state}`, hint === 'ok' && 'hint-ok', hint === 'blocked' && 'hint-blocked', isOver && 'over', alarm && 'alarm', alarm && open && 'open']
    .filter(Boolean)
    .join(' ')
  return (
    <section data-drop={`room:${room.id}`} className={cls} aria-label={`Кімната ${room.number}`} data-testid={`room-${room.number}`}>
      <header
        {...(alarm ? { role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: () => setOpen((o) => !o), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o) } } } : {})}
      >
        <strong>{room.number}</strong>
        <span className={`rm-badge ${state}`} data-testid={`occ-${room.number}`}>
          {state === 'inactive' ? 'неактивна' : `${room.occupied}/${room.capacity}`}
        </span>
        <span className="rm-actions">
          {alarm && <span className="rm-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>}
          {isAdmin && !alarm && (
            <button type="button" className="iconbtn quiet" title="Налаштування кімнати" aria-label={`Налаштування кімнати ${room.number}`} onClick={() => onEdit(room)}>
              <Icon name="gear" size={16} />
            </button>
          )}
        </span>
      </header>
      {(!alarm || open) && <ul>
        {pupils.map((p) => (
          <PupilChip key={p.id} pupil={p} roomId={room.id} canEdit={canEdit} dragging={draggingId === p.id} onDragStart={onDragStart} onMove={onMove} />
        ))}
        {pupils.length === 0 && <li className="muted small">порожня</li>}
      </ul>}
    </section>
  )
}

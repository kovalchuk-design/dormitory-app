import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '../../components/ui/icons'
import { PupilChip } from './PupilChip'
import { useRound } from '../round/roundState'
import '../round/round.css'
import { pupilName, roomState, type Pupil, type RoomInfo } from './logic'

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
  /** Режим «Обхід»: картка згорнута, розкривається клацанням; без налаштувань і перетягування. */
  round?: boolean
}

export function RoomCard({ room, pupils, canEdit, isAdmin, hint, isOver, draggingId, onDragStart, onMove, onEdit, round }: Props) {
  const [open, setOpen] = useState(false)
  const nightRound = useRound()
  const state = roomState(room)
  const dutyCount = round && nightRound ? pupils.filter((p) => nightRound.roster.get(p.id)?.isDuty).length : 0
  const presentCount = round && nightRound ? pupils.filter((p) => nightRound.roster.has(p.id)).length : 0
  const cls = ['rm-room', `is-${state}`, hint === 'ok' && 'hint-ok', hint === 'blocked' && 'hint-blocked', isOver && 'over', round && 'round', round && open && 'open', round && nightRound && presentCount === 0 && 'idle']
    .filter(Boolean)
    .join(' ')
  return (
    <section data-drop={`room:${room.id}`} className={cls} aria-label={`Кімната ${room.number}`} data-testid={`room-${room.number}`}>
      <header
        {...(round ? { role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: () => setOpen((o) => !o), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o) } } } : {})}
      >
        <strong>{room.number}</strong>
        {round && nightRound ? (
          // «Обхід»: скільки учнів залишається на ніч / скільки записано в кімнаті
          <span className={`rm-badge${presentCount > 0 ? ' free' : ''}`} data-testid={`occ-${room.number}`} title="Залишається на ніч / записано в кімнаті">
            {presentCount}/{pupils.length}
          </span>
        ) : (
          <span className={`rm-badge ${state}`} data-testid={`occ-${room.number}`}>
            {state === 'inactive' ? 'неактивна' : `${room.occupied}/${room.capacity}`}
          </span>
        )}
        {dutyCount > 0 && <span className="rd-duty-tag" title="У цій кімнаті є чергові на кухні">{dutyCount > 1 ? `Чергові · ${dutyCount}` : 'Черговий'}</span>}
        <span className="rm-actions">
          {round && <span className="rm-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>}
          {isAdmin && !round && (
            <button type="button" className="iconbtn quiet" title="Налаштування кімнати" aria-label={`Налаштування кімнати ${room.number}`} onClick={() => onEdit(room)}>
              <Icon name="gear" size={16} />
            </button>
          )}
        </span>
      </header>
      {(!round || open) && <ul>
        {round && nightRound
          ? pupils.map((p) => {
              const row = nightRound.roster.get(p.id)
              const on = !!row
              return (
                <li key={p.id} className={`rd-pupil${on ? '' : ' off'}`}>
                  <label className="rd-check">
                    <input type="checkbox" checked={on} aria-label={`Залишається на ніч: ${pupilName(p)}`}
                      onChange={(e) => void nightRound.togglePresent(p.id, room.id, e.target.checked)} />
                  </label>
                  <span className="rm-pupil-name">{pupilName(p)}</span>
                  <button type="button" role="switch" className="rd-switch duty" aria-checked={!!row?.isDuty} disabled={!on}
                    aria-label={`Черговий: ${pupilName(p)}`} title="Черговий"
                    onClick={() => void nightRound.toggleDuty(p.id, !row?.isDuty)} />
                </li>
              )
            })
          : pupils.map((p) => (
              <PupilChip key={p.id} pupil={p} roomId={room.id} canEdit={canEdit} dragging={draggingId === p.id} onDragStart={onDragStart} onMove={onMove} />
            ))}
        {pupils.length === 0 && <li className="muted small">порожня</li>}
      </ul>}
    </section>
  )
}

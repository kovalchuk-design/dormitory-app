import type { PointerEvent as ReactPointerEvent } from 'react'
import { pupilName, type Pupil } from './logic'

interface Props {
  pupil: Pupil
  roomId: string | null
  canEdit: boolean
  /** Додатковий підпис, напр. «було: 202» для нерозподілених. */
  note?: string
  dragging: boolean
  onDragStart: (e: ReactPointerEvent, pupil: Pupil, roomId: string | null) => void
  onMove: (p: Pupil, roomId: string | null) => void
  onHistory: (p: Pupil) => void
}

export function PupilChip({ pupil, roomId, canEdit, note, dragging, onDragStart, onMove, onHistory }: Props) {
  return (
    <li
      className={`rm-pupil${canEdit ? ' draggable' : ''}${dragging ? ' dragging' : ''}`}
      draggable={false}
      // Тягнути можна за всю картку учня, окрім кнопок усередині.
      onPointerDown={canEdit ? (e) => !(e.target as HTMLElement).closest('button') && onDragStart(e, pupil, roomId) : undefined}
      onMouseDown={canEdit ? (e) => !(e.target as HTMLElement).closest('button') && e.preventDefault() : undefined}
      onDragStart={(e) => e.preventDefault()}
      title={canEdit ? 'Перетягніть у іншу кімнату' : undefined}
    >
      <span className="rm-pupil-name">
        {pupilName(pupil)} <span className="muted small">{pupil.grade} кл.</span>
        {note && <span className="muted small"> · {note}</span>}
      </span>
      <button type="button" className="secondary rm-mini" title="Історія" aria-label={`Історія ${pupilName(pupil)}`} onClick={() => onHistory(pupil)}>
        🕘
      </button>
      {canEdit && (
        <button type="button" className="secondary rm-mini" onClick={() => onMove(pupil, roomId)}>
          Перемістити
        </button>
      )}
    </li>
  )
}

import { useDraggable } from '@dnd-kit/core'
import { pupilName, type Pupil } from './logic'

interface Props {
  pupil: Pupil
  roomId: string | null
  canEdit: boolean
  /** Додатковий підпис, напр. «було: 202» для нерозподілених. */
  note?: string
  onMove: (p: Pupil, roomId: string | null) => void
  onHistory: (p: Pupil) => void
}

export function PupilChip({ pupil, roomId, canEdit, note, onMove, onHistory }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: pupil.id,
    data: { pupil, roomId },
    disabled: !canEdit,
  })
  return (
    <li ref={setNodeRef} className={`rm-pupil${isDragging ? ' dragging' : ''}`}>
      <span
        className={`rm-pupil-name${canEdit ? ' draggable' : ''}`}
        {...(canEdit ? listeners : {})}
        {...(canEdit ? attributes : {})}
        aria-label={canEdit ? `${pupilName(pupil)}, ${pupil.grade} клас. Натисніть пробіл, щоб перетягнути` : undefined}
      >
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

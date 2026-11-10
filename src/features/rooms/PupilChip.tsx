import { useContext, type PointerEvent as ReactPointerEvent } from 'react'
import { HostelStudentCard } from '../../pages/hostelContext'
import { Icon } from '../../components/ui/icons'
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
}

/** Компактна однорядкова картка учня: ім'я ліворуч, іконка «перемістити» праворуч. */
export function PupilChip({ pupil, roomId, canEdit, note, dragging, onDragStart, onMove }: Props) {
  const { open } = useContext(HostelStudentCard)
  return (
    <li
      className={`rm-pupil${canEdit ? ' draggable' : ''}${dragging ? ' dragging' : ''}`}
      draggable={false}
      // Тягнути можна за будь-яке місце картки, зокрема за кнопку: клік без руху (<5 px) працює як звичайний клік.
      // ім'я — не зона перетягування: клік по ньому відкриває картку учня
      onPointerDown={canEdit ? (e) => { if (!(e.target as HTMLElement).closest('.rm-pupil-name')) onDragStart(e, pupil, roomId) } : undefined}
      onMouseDown={canEdit ? (e) => !(e.target as HTMLElement).closest('button, .rm-pupil-name') && e.preventDefault() : undefined}
      onDragStart={(e) => e.preventDefault()}
      title={canEdit ? 'Перетягніть у іншу кімнату (за будь-яке місце, крім імені)' : undefined}
    >
      <span className="rm-pupil-main">
        <button type="button" className="rm-pupil-name" title="Відкрити картку учня" onClick={() => open(pupil.id)}>{pupilName(pupil)}</button>
        {pupil.grade ? <span className="muted small"> {pupil.grade} кл.</span> : null}
        {note && <span className="muted small"> · {note}</span>}
      </span>
      {canEdit && (
        <button type="button" className="iconbtn quiet" title="Перемістити" aria-label={`Перемістити ${pupilName(pupil)}`} onClick={() => onMove(pupil, roomId)}>
          <Icon name="move" size={18} />
        </button>
      )}
    </li>
  )
}

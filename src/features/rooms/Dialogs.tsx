import { useState } from 'react'
import { Dialog } from './Dialog'
import {
  DEFAULT_CAPACITY, FLOORS, MAX_CAPACITY, MIN_CAPACITY, formatDate, pupilFullName, roomState, validateCapacity,
  validateDeactivate, validateNewRoom, validateDrop, buildHistory, type DropTarget, type Pupil, type RoomInfo,
} from './logic'
import { useEffect } from 'react'
import { fetchHistory, type HistoryStay } from './api'
import { describeError } from './logic'
import { Select } from '../../components/ui/Select'

// ------------------------------------------------------------------ підтвердження

export function ConfirmMoveDialog(props: {
  pupil: Pupil
  from: RoomInfo | null
  to: RoomInfo | null
  busy: boolean
  error: string | null
  onConfirm: (reason: string | null) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const { pupil, from, to, busy, error } = props
  return (
    <Dialog title="Підтвердити переміщення?" onClose={props.onCancel}>
      <dl className="rm-summary">
        <dt>Учень</dt>
        <dd>{pupilFullName(pupil)}, {pupil.grade} клас</dd>
        <dt>Звідки</dt>
        <dd>{from ? `кімната ${from.number} (${from.floor} поверх)` : 'Нерозподілені'}</dd>
        <dt>Куди</dt>
        <dd>{to ? `кімната ${to.number} (${to.floor} поверх)` : 'Нерозподілені'}</dd>
      </dl>
      <label>
        Причина
        <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="rm-buttons">
        <button type="button" className="secondary" onClick={props.onCancel} disabled={busy}>Скасувати</button>
        <button type="button" autoFocus disabled={busy} onClick={() => props.onConfirm(reason.trim() || null)}>
          {busy ? 'Зачекайте…' : 'Підтвердити'}
        </button>
      </div>
    </Dialog>
  )
}

// -------------------------------------------------- вибір кімнати (телефон / клавіатура)

export function PickRoomDialog(props: {
  pupil: Pupil
  fromRoomId: string | null
  rooms: RoomInfo[]
  roomMap: ReadonlyMap<string, RoomInfo>
  onPick: (t: DropTarget) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const target: DropTarget | null = value === 'pool' ? { kind: 'pool' } : value ? { kind: 'room', roomId: value } : null
  const check = target ? validateDrop(props.fromRoomId, target, props.roomMap) : null
  return (
    <Dialog title={`Перемістити: ${pupilFullName(props.pupil)}`} onClose={props.onCancel}>
      <label>
        Нове місце
        <Select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
          <option value="">— оберіть —</option>
          {props.fromRoomId !== null && <option value="pool">Нерозподілені</option>}
          {FLOORS.map((f) => (
            <optgroup key={f} label={`${f} поверх`}>
              {props.rooms.filter((r) => r.floor === f).map((r) => {
                const st = roomState(r)
                const unavailable = r.id === props.fromRoomId || st !== 'free'
                return (
                  <option key={r.id} value={r.id} disabled={unavailable}>
                    {r.number} ({st === 'inactive' ? 'неактивна' : `${r.occupied}/${r.capacity}`}
                    {r.id === props.fromRoomId ? ', поточна' : st === 'full' ? ', заповнена' : ''})
                  </option>
                )
              })}
            </optgroup>
          ))}
        </Select>
      </label>
      {check && !check.ok && <p className="error" role="alert">{check.message}</p>}
      <div className="rm-buttons">
        <button type="button" className="secondary" onClick={props.onCancel}>Скасувати</button>
        <button type="button" disabled={!target || !check?.ok} onClick={() => target && props.onPick(target)}>Далі</button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------- керування кімнатою

export function EditRoomDialog(props: {
  room: RoomInfo
  isAdmin: boolean
  busy: boolean
  error: string | null
  onSave: (patch: { capacity?: number; is_active?: boolean }) => void
  onCancel: () => void
}) {
  const { room } = props
  const [capacity, setCapacity] = useState(String(room.capacity))
  const [active, setActive] = useState(room.isActive)
  const cap = Number(capacity)
  const capCheck = validateCapacity(cap, room.occupied)
  const deact = room.isActive && !active ? validateDeactivate(room.occupied) : { ok: true as const }
  const problem = !capCheck.ok ? capCheck.message : !deact.ok ? deact.message : null
  return (
    <Dialog title={`Кімната ${room.number} (${room.floor} поверх)`} onClose={props.onCancel}>
      <p className="muted small">Зараз мешкає: {room.occupied}</p>
      <label>
        Місткість ({MIN_CAPACITY}–{MAX_CAPACITY})
        <input type="number" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </label>
      {props.isAdmin ? (
        <label className="rm-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Кімната активна
        </label>
      ) : (
        <p className="muted small">Активність кімнати змінює лише адміністратор.</p>
      )}
      {(problem || props.error) && <p className="error" role="alert">{problem ?? props.error}</p>}
      <div className="rm-buttons">
        <button type="button" className="secondary" onClick={props.onCancel} disabled={props.busy}>Скасувати</button>
        <button
          type="button"
          disabled={props.busy || problem !== null}
          onClick={() => {
            const patch: { capacity?: number; is_active?: boolean } = {}
            if (cap !== room.capacity) patch.capacity = cap
            if (props.isAdmin && active !== room.isActive) patch.is_active = active
            props.onSave(patch)
          }}
        >
          Зберегти
        </button>
      </div>
    </Dialog>
  )
}

export function NewRoomDialog(props: {
  rooms: RoomInfo[]
  busy: boolean
  error: string | null
  onCreate: (v: { floor: number; number: string; capacity: number }) => void
  onCancel: () => void
}) {
  const [floor, setFloor] = useState(2)
  const [number, setNumber] = useState('')
  const [capacity, setCapacity] = useState(String(DEFAULT_CAPACITY))
  const input = { floor, number, capacity: Number(capacity) }
  const check = validateNewRoom(input, props.rooms)
  return (
    <Dialog title="Нова кімната" onClose={props.onCancel}>
      <label>
        Поверх
        <Select value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
          {FLOORS.map((f) => <option key={f} value={f}>{f}</option>)}
        </Select>
      </label>
      <label>
        Номер
        <input value={number} maxLength={10} onChange={(e) => setNumber(e.target.value)} />
      </label>
      <label>
        Місткість
        <input type="number" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </label>
      {number !== '' && !check.ok && <p className="error" role="alert">{check.message}</p>}
      {props.error && <p className="error" role="alert">{props.error}</p>}
      <div className="rm-buttons">
        <button type="button" className="secondary" onClick={props.onCancel} disabled={props.busy}>Скасувати</button>
        <button type="button" disabled={props.busy || !check.ok} onClick={() => props.onCreate({ ...input, number: number.trim() })}>Створити</button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------- історія

export function HistoryDialog(props: {
  title: string
  filter: { studentId: string } | { roomId: string }
  showStudent: boolean
  onClose: () => void
}) {
  const [rows, setRows] = useState<HistoryStay[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(props.filter)
  useEffect(() => {
    let alive = true
    void fetchHistory(JSON.parse(key)).then((r) => {
      if (!alive) return
      if (r.error) setError(describeError(r.error))
      else setRows(r.data)
    })
    return () => { alive = false }
  }, [key])
  const entries = rows ? buildHistory(rows) : []
  const byId = new Map((rows ?? []).map((r) => [r.id, r]))
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      {error && <p className="error" role="alert">{error}</p>}
      {!rows && !error && <p className="muted">Завантаження…</p>}
      {rows && entries.length === 0 && <p className="muted">Переміщень ще не було.</p>}
      <ul className="rm-history">
        {entries.map((e) => {
          const src = byId.get(e.id)
          return (
            <li key={e.id}>
              <strong>{formatDate(e.fromDate)}</strong>{' '}
              {props.showStudent && <span>{e.studentName}: </span>}
              {e.fromRoomNumber ? `${e.fromRoomNumber} → ${e.roomNumber}` : `Нерозподілені → ${e.roomNumber}`}
              {src?.movedByName && <span className="muted"> · {src.movedByName}</span>}
              {e.reason && <span className="muted"> · «{e.reason}»</span>}
              {e.toDate && (
                <div className="muted small">
                  до {formatDate(e.toDate)}
                  {e.end.kind === 'moved' ? ` · далі: кімната ${e.end.toRoomNumber}` : ' · далі: Нерозподілені'}
                  {src?.endedByName ? ` · завершив(ла): ${src.endedByName}` : ''}
                  {e.endReason ? ` · «${e.endReason}»` : ''}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="rm-buttons"><button type="button" onClick={props.onClose}>Закрити</button></div>
    </Dialog>
  )
}

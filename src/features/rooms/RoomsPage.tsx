import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { assignStudent, createRoom, fetchCurrentRoomId, moveStudent, unassignStudent, updateRoom } from './api'
import { ConfirmMoveDialog, EditRoomDialog, HistoryDialog, NewRoomDialog, PickRoomDialog } from './Dialogs'
import { PupilChip } from './PupilChip'
import { RoomCard, type DropHint } from './RoomCard'
import {
  FLOORS, STALE_CODES, describeError, errorCode, groupPupilsByRoom, groupRoomsByFloor, pickOperation, pupilName, validateCapacity, validateDrop,
  type DropTarget, type Pupil, type RoomInfo,
} from './logic'
import { useRoomsBoard } from './useRoomsBoard'
import { usePointerDrag } from './usePointerDrag'
import './rooms.css'

interface Pending {
  pupil: Pupil
  fromRoomId: string | null
  target: DropTarget
}

type HistoryTarget = { title: string; filter: { studentId: string } | { roomId: string }; showStudent: boolean }

function Pool({ pupils, lastRoom, canEdit, hint, isOver, draggingId, onDragStart, onMove, onHistory }: {
  pupils: Pupil[]
  lastRoom: Record<string, string>
  canEdit: boolean
  hint: DropHint
  isOver: boolean
  draggingId: string | null
  onDragStart: (e: ReactPointerEvent, pupil: Pupil, roomId: string | null) => void
  onMove: (p: Pupil, roomId: string | null) => void
  onHistory: (p: Pupil) => void
}) {
  return (
    <section
      data-drop="pool"
      className={`rm-pool${hint === 'ok' ? ' hint-ok' : ''}${hint === 'blocked' ? ' hint-blocked' : ''}${isOver ? ' over' : ''}`}
      aria-label="Нерозподілені"
      data-testid="pool"
    >
      <header>
        <strong>Нерозподілені</strong> <span className="rm-badge">{pupils.length}</span>
      </header>
      <ul>
        {pupils.map((p) => (
          <PupilChip key={p.id} pupil={p} roomId={null} canEdit={canEdit} dragging={draggingId === p.id} onDragStart={onDragStart} note={lastRoom[p.id] ? `було: ${lastRoom[p.id]}` : undefined} onMove={onMove} onHistory={onHistory} />
        ))}
        {pupils.length === 0 && <li className="muted small">Усіх учнів розподілено.</li>}
      </ul>
    </section>
  )
}

export function RoomsPage() {
  const { profile } = useAuth()
  const role = profile?.role
  const canEdit = role === 'admin' || role === 'educator'
  const isAdmin = role === 'admin'

  const { data, error, loading, refresh } = useRoomsBoard()
  const [floorTab, setFloorTab] = useState<number>(profile?.floor ?? FLOORS[0])
  const [picking, setPicking] = useState<{ pupil: Pupil; fromRoomId: string | null } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [editing, setEditing] = useState<RoomInfo | null>(null)
  const [creating, setCreating] = useState(false)
  const [history, setHistory] = useState<HistoryTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const { drag, begin } = usePointerDrag({
    onStart: () => setNotice(null),
    onDrop: (item, target) => requestMove(item.pupil, item.fromRoomId, target),
  })
  const dragging = drag?.item ?? null
  const onDragStart = (e: ReactPointerEvent, pupil: Pupil, fromRoomId: string | null) => begin(e, { pupil, fromRoomId })
  const isOver = (t: DropTarget) =>
    drag?.over != null && (t.kind === 'pool' ? drag.over.kind === 'pool' : drag.over.kind === 'room' && drag.over.roomId === t.roomId)

  const rooms = useMemo(() => data?.rooms ?? [], [data])
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])
  const byFloor = useMemo(() => groupRoomsByFloor(rooms), [rooms])
  const pupilsByRoom = useMemo(() => groupPupilsByRoom(data?.placed ?? []), [data])

  const hintFor = (target: DropTarget): DropHint => {
    if (!dragging) return null
    const c = validateDrop(dragging.fromRoomId, target, roomMap)
    if (c.ok) return 'ok'
    return c.code === 'ALREADY_IN_ROOM' || c.code === 'ALREADY_UNPLACED' ? null : 'blocked'
  }

  function requestMove(pupil: Pupil, fromRoomId: string | null, target: DropTarget) {
    const check = validateDrop(fromRoomId, target, roomMap)
    if (!check.ok) {
      setNotice({ kind: 'error', text: check.message })
      return
    }
    setNotice(null)
    setDialogError(null)
    setPending({ pupil, fromRoomId, target })
  }

  async function confirm(reason: string | null) {
    if (!pending) return
    setBusy(true)
    setDialogError(null)
    const { pupil, fromRoomId, target } = pending
    // Захист від застарілого стану: учня могли перемістити, поки діалог був відкритий.
    const cur = await fetchCurrentRoomId(pupil.id)
    if (!cur.error && cur.data !== fromRoomId) {
      setBusy(false)
      setPending(null)
      setNotice({ kind: 'error', text: `${pupilName(pupil)} уже переміщено іншим вихователем. Дані оновлено — повторіть дію, якщо потрібно.` })
      void refresh()
      return
    }
    const op = pickOperation(fromRoomId, target)
    const res =
      op === 'unassign'
        ? await unassignStudent(pupil.id, reason)
        : op === 'assign'
          ? await assignStudent(pupil.id, (target as { roomId: string }).roomId, reason)
          : await moveStudent(pupil.id, (target as { roomId: string }).roomId, reason)
    setBusy(false)
    if (res.error) {
      const code = errorCode(res.error)
      const text = describeError(res.error)
      if (code && STALE_CODES.has(code)) setPending(null) // стан застарів — закриваємо діалог, показуємо помилку
      else setDialogError(text)
      setNotice({ kind: 'error', text })
      void refresh() // «відкат»: інтерфейс завжди показує стан сервера
      return
    }
    setPending(null)
    setNotice({ kind: 'ok', text: `${pupilName(pupil)}: переміщено.` })
    void refresh()
  }

  async function saveRoom(patch: { capacity?: number; is_active?: boolean }) {
    if (!editing) return
    if (Object.keys(patch).length === 0) return setEditing(null)
    setBusy(true)
    setDialogError(null)
    const res = await updateRoom(editing.id, patch)
    setBusy(false)
    if (res.error) {
      setDialogError(describeError(res.error))
      void refresh()
      return
    }
    setEditing(null)
    void refresh()
  }

  async function changeCapacity(room: RoomInfo, capacity: number) {
    const check = validateCapacity(capacity, room.occupied)
    if (!check.ok) return setNotice({ kind: 'error', text: check.message })
    const res = await updateRoom(room.id, { capacity })
    if (res.error) setNotice({ kind: 'error', text: describeError(res.error) })
    else setNotice({ kind: 'ok', text: `Кімната ${room.number}: місткість ${capacity}.` })
    void refresh()
  }

  async function addRoom(v: { floor: number; number: string; capacity: number }) {
    setBusy(true)
    setDialogError(null)
    const res = await createRoom(v)
    setBusy(false)
    if (res.error) return setDialogError(describeError(res.error))
    setCreating(false)
    setFloorTab(v.floor)
    void refresh()
  }

  const openHistory = (p: Pupil) => setHistory({ title: `Історія: ${pupilName(p)}`, filter: { studentId: p.id }, showStudent: false })
  const startPick = (p: Pupil, fromRoomId: string | null) => setPicking({ pupil: p, fromRoomId })

  if (loading) return <p className="muted">Завантаження…</p>

  return (
    <section className="rm-page">
      <div className="rm-title">
        <h1>Кімнати</h1>
        {isAdmin && (
          <button type="button" onClick={() => { setDialogError(null); setCreating(true) }}>+ Кімната</button>
        )}
      </div>
      {!canEdit && <p className="muted small">Режим перегляду: переміщення недоступні.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && (
        <p className={notice.kind === 'error' ? 'error rm-notice' : 'rm-notice ok'} role="status" data-testid="notice">
          {notice.text}
        </p>
      )}

      <>
        <Pool
          pupils={data?.unplaced ?? []}
          lastRoom={data?.lastRoom ?? {}}
          canEdit={canEdit}
          hint={dragging ? hintFor({ kind: 'pool' }) : null}
          isOver={isOver({ kind: 'pool' })}
          draggingId={dragging?.pupil.id ?? null}
          onDragStart={onDragStart}
          onMove={startPick}
          onHistory={openHistory}
        />

        <div className="rm-tabs" role="tablist" aria-label="Поверхи">
          {FLOORS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={floorTab === f} className={floorTab === f ? 'active' : ''} onClick={() => setFloorTab(f)}>
              {f} поверх
            </button>
          ))}
        </div>

        <div className="rm-floors">
          {FLOORS.map((f) => (
            <div key={f} className={`rm-floor${floorTab === f ? ' current' : ''}`} data-testid={`floor-${f}`}>
              <h2>{f} поверх</h2>
              <div className="rm-rooms">
                {(byFloor.get(f) ?? []).map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    pupils={pupilsByRoom.get(r.id) ?? []}
                    canEdit={canEdit}
                    isAdmin={isAdmin}
                    isOver={isOver({ kind: 'room', roomId: r.id })}
                    draggingId={dragging?.pupil.id ?? null}
                    onDragStart={onDragStart}
                    onCapacity={(room, cap) => void changeCapacity(room, cap)}
                    hint={hintFor({ kind: 'room', roomId: r.id })}
                    onMove={startPick}
                    onHistory={openHistory}
                    onRoomHistory={(room) => setHistory({ title: `Історія кімнати ${room.number}`, filter: { roomId: room.id }, showStudent: true })}
                    onEdit={(room) => { setDialogError(null); setEditing(room) }}
                  />
                ))}
                {(byFloor.get(f) ?? []).length === 0 && <p className="muted small">Кімнат немає.</p>}
              </div>
            </div>
          ))}
        </div>

        {drag && (
          <div className="rm-overlay" style={{ left: drag.x + 12, top: drag.y + 12 }}>
            {pupilName(drag.item.pupil)}
          </div>
        )}
      </>

      {picking && (
        <PickRoomDialog
          pupil={picking.pupil}
          fromRoomId={picking.fromRoomId}
          rooms={rooms}
          roomMap={roomMap}
          onCancel={() => setPicking(null)}
          onPick={(t) => {
            const p = picking
            setPicking(null)
            requestMove(p.pupil, p.fromRoomId, t)
          }}
        />
      )}
      {pending && (
        <ConfirmMoveDialog
          pupil={pending.pupil}
          from={pending.fromRoomId ? (roomMap.get(pending.fromRoomId) ?? null) : null}
          to={pending.target.kind === 'room' ? (roomMap.get(pending.target.roomId) ?? null) : null}
          busy={busy}
          error={dialogError}
          onConfirm={(r) => void confirm(r)}
          onCancel={() => setPending(null)}
        />
      )}
      {editing && (
        <EditRoomDialog
          // перечитуємо актуальні дані кімнати
          room={roomMap.get(editing.id) ?? editing}
          isAdmin={isAdmin}
          busy={busy}
          error={dialogError}
          onSave={(p) => void saveRoom(p)}
          onCancel={() => setEditing(null)}
        />
      )}
      {creating && <NewRoomDialog rooms={rooms} busy={busy} error={dialogError} onCreate={(v) => void addRoom(v)} onCancel={() => setCreating(false)} />}
      {history && <HistoryDialog {...history} onClose={() => setHistory(null)} />}
    </section>
  )
}

import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
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
import './rooms.css'

interface Pending {
  pupil: Pupil
  fromRoomId: string | null
  target: DropTarget
}

type HistoryTarget = { title: string; filter: { studentId: string } | { roomId: string }; showStudent: boolean }

// Для миші/дотику — за позицією вказівника; для клавіатури (вказівника немає) — за перетином прямокутників.
const collisionDetection: CollisionDetection = (args) => {
  return args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
}

function Pool({ pupils, lastRoom, canEdit, hint, onMove, onHistory }: {
  pupils: Pupil[]
  lastRoom: Record<string, string>
  canEdit: boolean
  hint: DropHint
  onMove: (p: Pupil, roomId: string | null) => void
  onHistory: (p: Pupil) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { kind: 'pool' } })
  return (
    <section
      ref={setNodeRef}
      className={`rm-pool${hint === 'ok' ? ' hint-ok' : ''}${hint === 'blocked' ? ' hint-blocked' : ''}${isOver ? ' over' : ''}`}
      aria-label="Нерозподілені"
      data-testid="pool"
    >
      <header>
        <strong>Нерозподілені</strong> <span className="rm-badge">{pupils.length}</span>
      </header>
      <ul>
        {pupils.map((p) => (
          <PupilChip key={p.id} pupil={p} roomId={null} canEdit={canEdit} note={lastRoom[p.id] ? `було: ${lastRoom[p.id]}` : undefined} onMove={onMove} onHistory={onHistory} />
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
  const [dragging, setDragging] = useState<{ pupil: Pupil; fromRoomId: string | null } | null>(null)
  const [picking, setPicking] = useState<{ pupil: Pupil; fromRoomId: string | null } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [editing, setEditing] = useState<RoomInfo | null>(null)
  const [creating, setCreating] = useState(false)
  const [history, setHistory] = useState<HistoryTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

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

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { pupil: Pupil; roomId: string | null }
    // Сповіщення тут НЕ прибираємо: розмітка зсунулась би вгору вже після того, як dnd-kit виміряв зони скидання,
    // і вони б розійшлися з тим, що бачить користувач (скидання «мимо» на висоту сповіщення). Воно зникне в requestMove.
    setDragging({ pupil: d.pupil, fromRoomId: d.roomId })
  }

  function onDragEnd(e: DragEndEvent) {
    const d = dragging
    setDragging(null)
    if (!d || !e.over) return
    const o = e.over.data.current as { kind: 'room'; roomId: string } | { kind: 'pool' }
    const target: DropTarget = o.kind === 'pool' ? { kind: 'pool' } : { kind: 'room', roomId: o.roomId }
    requestMove(d.pupil, d.fromRoomId, target)
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

      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <Pool
          pupils={data?.unplaced ?? []}
          lastRoom={data?.lastRoom ?? {}}
          canEdit={canEdit}
          hint={dragging ? hintFor({ kind: 'pool' }) : null}
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

        <DragOverlay>{dragging ? <div className="rm-overlay">{pupilName(dragging.pupil)}</div> : null}</DragOverlay>
      </DndContext>

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

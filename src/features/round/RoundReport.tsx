import { useMemo, useState } from 'react'
import { ScrollArea } from '../../components/ui/ScrollArea'
import { useRoomsBoard } from '../rooms/useRoomsBoard'
import { Dialog } from '../rooms/Dialog'
import { compareRooms, comparePupils, FLOORS, pupilName, type Pupil } from '../rooms/logic'
import { nightLabel } from './night'
import { useRound } from './roundState'
import './round.css'

const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'учень' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'учні' : 'учнів')

/** «Звіт»: простий список поверхів → кімнат → учнів, які залишаються на ніч, чергові на кухні й суми. Оновлюється в реальному часі. */
export function RoundReport() {
  const round = useRound()
  const { data, loading, error } = useRoomsBoard()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const model = useMemo(() => {
    const roster = round?.roster
    if (!data || !roster) return null
    const pupilById = new Map<string, { pupil: Pupil; roomId: string }>(data.placed.map((p) => [p.pupil.id, { pupil: p.pupil, roomId: p.roomId }]))
    const roomById = new Map(data.rooms.map((r) => [r.id, r]))
    const floors = FLOORS.map((f) => {
      const rooms = data.rooms.filter((r) => r.floor === f).sort(compareRooms).map((room) => {
        const pupils = data.placed.filter((p) => p.roomId === room.id && roster.has(p.pupil.id)).map((p) => p.pupil).sort(comparePupils)
        return { room, pupils }
      }).filter((r) => r.pupils.length > 0)
      const duty = [...roster.values()].filter((r) => r.isDuty).map((r) => pupilById.get(r.studentId)).filter((x): x is { pupil: Pupil; roomId: string } => !!x && roomById.get(x.roomId)?.floor === f)
        .map((x) => ({ pupil: x.pupil, room: roomById.get(x.roomId)?.number ?? '' })).sort((a, b) => a.room.localeCompare(b.room, 'uk', { numeric: true }) || comparePupils(a.pupil, b.pupil))
      return { floor: f, rooms, duty, count: rooms.reduce((n, r) => n + r.pupils.length, 0) }
    })
    return { floors, total: floors.reduce((n, f) => n + f.count, 0) }
  }, [data, round?.roster])

  if (!round || loading || round.loading) return <p className="muted">Завантаження…</p>
  if (error || round.error) return <p className="error" role="alert">{error ?? round.error}</p>
  if (!model) return null

  return (
    <ScrollArea className="rd-scroll" body="rd-body" inset={8}>
      <p className="rd-night muted small">Вечір {nightLabel(round.night)}</p>
      {model.floors.map((f) => (
        <section key={f.floor} className="rd-floor" aria-label={`${f.floor} поверх`}>
          <h2>{f.floor} поверх <span className="rd-count">{f.count} {word(f.count)}</span></h2>
          {f.rooms.map(({ room, pupils }) => (
            <div key={room.id} className="rd-room">
              <ul>{pupils.map((p) => <li key={p.id}>{pupilName(p)}</li>)}</ul>
              <span className="rd-room-tag" aria-label={`Кімната ${room.number}`}>{room.number}</span>
            </div>
          ))}
          {f.rooms.length === 0 && <p className="muted rd-none">Нікого</p>}
          <div className="rd-duty">
            <strong>Чергові на кухні</strong>
            {f.duty.length ? <ul>{f.duty.map((d) => <li key={d.pupil.id}><span>{pupilName(d.pupil)}</span><span className="rd-room-tag" aria-label={`Кімната ${d.room}`}>{d.room}</span></li>)}</ul> : <span className="muted"> —</span>}
          </div>
        </section>
      ))}
      <p className="rd-total"><strong>Усього залишається на ніч:</strong> {model.total} {word(model.total)}</p>
      <button type="button" className="secondary rd-reset" onClick={() => { setResetError(null); setConfirming(true) }}>Почати новий звіт</button>
      {confirming && (
        <Dialog title="Почати новий звіт?" onClose={() => !busy && setConfirming(false)}>
          <p>Усі відмітки «залишається на ніч» і чергові за цей вечір буде очищено. Скасувати це неможливо.</p>
          {resetError && <p className="error" role="alert">{resetError}</p>}
          <div className="rm-buttons">
            <button type="button" className="secondary" autoFocus disabled={busy} onClick={() => setConfirming(false)}>Скасувати</button>
            <button type="button" className="btn-danger" disabled={busy} onClick={async () => {
              setBusy(true)
              const err = await round.reset()
              setBusy(false)
              if (err) setResetError(err); else setConfirming(false)
            }}>{busy ? 'Зачекайте…' : 'Так, скинути'}</button>
          </div>
        </Dialog>
      )}
    </ScrollArea>
  )
}

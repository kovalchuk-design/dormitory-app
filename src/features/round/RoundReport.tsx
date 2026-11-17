import { useMemo, useState } from 'react'
import { ScrollArea } from '../../components/ui/ScrollArea'
import { useRoomsBoard } from '../rooms/useRoomsBoard'
import { Dialog } from '../rooms/Dialog'
import { compareRooms, comparePupils, FLOORS, pupilName, type Pupil } from '../rooms/logic'
import { ContactsModal } from './ContactsModal'
import { nightLabel } from './night'
import { useRound } from './roundState'
import './round.css'

const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'учень' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'учні' : 'учнів')

/** «Звіт»: повний список поверхів → кімнат → усіх учнів за поселенням (відсутніх на ніч показано блідим шрифтом), чергові на кухні й суми. Оновлюється в реальному часі. */
export function RoundReport() {
  const round = useRound()
  const { data, loading, error } = useRoomsBoard()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [contact, setContact] = useState<{ pupil: Pupil; room: string } | null>(null)

  const model = useMemo(() => {
    const roster = round?.roster
    if (!data || !roster) return null
    const pupilById = new Map<string, { pupil: Pupil; roomId: string }>(data.placed.map((p) => [p.pupil.id, { pupil: p.pupil, roomId: p.roomId }]))
    const roomById = new Map(data.rooms.map((r) => [r.id, r]))
    const floors = FLOORS.map((f) => {
      const rooms = data.rooms.filter((r) => r.floor === f).sort(compareRooms).map((room) => {
        const pupils = data.placed.filter((p) => p.roomId === room.id).map((p) => p.pupil).sort(comparePupils)
        return { room, pupils, present: pupils.filter((p) => roster.has(p.id)).length }
      }).filter((r) => r.pupils.length > 0)
      const duty = [...roster.values()].filter((r) => r.isDuty).map((r) => pupilById.get(r.studentId)).filter((x): x is { pupil: Pupil; roomId: string } => !!x && roomById.get(x.roomId)?.floor === f)
        .map((x) => ({ pupil: x.pupil, room: roomById.get(x.roomId)?.number ?? '' })).sort((a, b) => a.room.localeCompare(b.room, 'uk', { numeric: true }) || comparePupils(a.pupil, b.pupil))
      return { floor: f, rooms, duty, count: rooms.reduce((n, r) => n + r.present, 0) }
    })
    return { floors, total: floors.reduce((n, f) => n + f.count, 0) }
  }, [data, round?.roster])

  // пошук: усі слова запиту мають зустрітись у «прізвище ім'я» або в номері кімнати
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = tokens.length > 0
  const matches = (p: Pupil, room: string) => { const hay = `${p.lastName} ${p.firstName} ${room}`.toLowerCase(); return tokens.every((t) => hay.includes(t)) }
  const shownFloors = !model ? [] : model.floors.map((f) => ({
    ...f,
    rooms: searching ? f.rooms.map((r) => ({ room: r.room, present: r.present, pupils: r.pupils.filter((p) => matches(p, r.room.number)) })).filter((r) => r.pupils.length > 0) : f.rooms,
  })).filter((f) => !searching || f.rooms.length > 0)

  if (!round || loading || round.loading) return <p className="muted">Завантаження…</p>
  if (error || round.error) return <p className="error" role="alert">{error ?? round.error}</p>
  if (!model) return null

  return (
    <>
    <input type="search" className="rd-search" value={query} onChange={(e) => setQuery(e.target.value)}
      placeholder="Пошук учня або кімнати" aria-label="Пошук учня або кімнати" autoComplete="off" enterKeyHint="search" />
    <ScrollArea className="rd-scroll" body="rd-body" inset={8}>
      <p className="rd-night muted small">Вечір {nightLabel(round.night)}</p>
      {searching && shownFloors.length === 0 && <p className="muted">Нікого не знайдено.</p>}
      {shownFloors.map((f) => (
        <section key={f.floor} className="rd-floor" aria-label={`${f.floor} поверх`}>
          <h2>{f.floor} поверх <span className={`rm-badge rd-count${f.count > 0 ? ' free' : ''}`}>{f.count} {word(f.count)}</span></h2>
          {f.rooms.map(({ room, pupils }) => (
            <div key={room.id} className="rd-room">
              <ul>{pupils.map((p) => <li key={p.id} className={round.roster.has(p.id) ? undefined : 'away'}><button type="button" className="rd-name" onClick={() => setContact({ pupil: p, room: room.number })}>{pupilName(p)}</button></li>)}</ul>
              <span className="rd-room-tag" aria-label={`Кімната ${room.number}`}>{room.number}</span>
            </div>
          ))}
          {f.rooms.length === 0 && !searching && <p className="muted rd-none">Нікого</p>}
          {!searching && <div className="rd-duty">
            <strong>Чергові на кухні</strong>
            {f.duty.length ? <ul>{f.duty.map((d) => <li key={d.pupil.id}><button type="button" className="rd-name" onClick={() => setContact({ pupil: d.pupil, room: d.room })}>{pupilName(d.pupil)}</button><span className="rd-room-tag" aria-label={`Кімната ${d.room}`}>{d.room}</span></li>)}</ul> : <span className="muted"> —</span>}
          </div>}
        </section>
      ))}
      <p className="rd-total"><strong>Усього залишається на ніч</strong><span className={`rm-badge rd-count${model.total > 0 ? ' free' : ''}`}>{model.total} {word(model.total)}</span></p>
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
    {contact && <ContactsModal pupil={contact.pupil} room={contact.room} onClose={() => setContact(null)} />}
    </>
  )
}

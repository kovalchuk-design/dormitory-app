import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchRoster, setDuty, setPresent, type RosterRow } from './api'
import { nightDate } from './night'

export type Roster = Map<string, RosterRow>

/** Відмітки поточного вечора: оновлюються в реальному часі (Realtime), раз на хвилину перевіряється зміна вечора (18:00). */
export function useNightRoster() {
  const [night, setNight] = useState(() => nightDate())
  const [roster, setRoster] = useState<Roster>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const nightRef = useRef(night)
  useEffect(() => { nightRef.current = night }, [night])

  const refresh = useCallback(async () => {
    const my = ++seq.current
    const n = nightRef.current
    const res = await fetchRoster(n)
    if (my !== seq.current) return
    if (res.error) setError(res.error)
    else { setRoster(new Map(res.rows.map((r) => [r.studentId, r]))); setError(null) }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [night, refresh])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(() => void refresh(), 250) }
    const channel = supabase.channel('night-roster').on('postgres_changes', { event: '*', schema: 'public', table: 'night_roster' }, soon).subscribe()
    const tick = setInterval(() => {
      const n = nightDate()
      if (n !== nightRef.current) setNight(n)
      else if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') { const n = nightDate(); if (n !== nightRef.current) setNight(n); else void refresh() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(debounce); clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); void supabase.removeChannel(channel) }
  }, [refresh])

  /** Оптимістично міняємо локально, при помилці повертаємо як було й показуємо повідомлення. */
  const togglePresent = useCallback(async (studentId: string, roomId: string, on: boolean) => {
    const before = roster
    setRoster((m) => { const next = new Map(m); if (on) next.set(studentId, { studentId, roomId, isDuty: false }); else next.delete(studentId); return next })
    const err = await setPresent(night, studentId, roomId, on)
    if (err) { setRoster(before); setError(err) } else setError(null)
  }, [night, roster])

  const toggleDuty = useCallback(async (studentId: string, duty: boolean) => {
    const before = roster
    setRoster((m) => { const cur = m.get(studentId); if (!cur) return m; const next = new Map(m); next.set(studentId, { ...cur, isDuty: duty }); return next })
    const err = await setDuty(night, studentId, duty)
    if (err) { setRoster(before); setError(err) } else setError(null)
  }, [night, roster])

  return { night, roster, error, loading, togglePresent, toggleDuty, refresh }
}

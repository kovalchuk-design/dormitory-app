import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchBoard, type BoardData } from './api'
import { describeError } from './logic'

const POLL_MS = 15000

/** Завантажує дані дошки; оновлює їх Realtime-подіями (якщо ввімкнено для таблиць) і опитуванням. */
export function useRoomsBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const my = ++seq.current
    const res = await fetchBoard()
    if (my !== seq.current) return // є новіший запит
    if (res.error) setError(describeError(res.error))
    else {
      setData(res.data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    let debounce: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refresh(), 300)
    }
    const channel = supabase
      .channel('rooms-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_assignments' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, soon)
      .subscribe()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(debounce)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  return { data, error, loading, refresh }
}

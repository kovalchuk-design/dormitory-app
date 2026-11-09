import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './format'

export interface LoadState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/** Мінімальний хук завантаження; `key` змінюється → повторний запит. Старі дані лишаються під час перезавантаження. */
export function useLoad<T>(fn: () => Promise<T>, key: string): LoadState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState({ data: null, error: errorMessage(e), loading: false }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const EVENT = 'pending-updates-changed'

/** Викликати після підтвердження/відхилення/подання, щоб оновити значок у навігації. */
export function notifyPendingChanged(): void {
  window.dispatchEvent(new Event(EVENT))
}

/** Кількість версій анкет, що чекають підтвердження (лише admin/educator — для інших 0 і запиту немає). */
export function usePendingCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = async () => {
      const { count: c, error } = await supabase
        .from('student_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (alive && !error) setCount(c ?? 0)
    }
    void load()
    const onChange = () => void load()
    window.addEventListener(EVENT, onChange)
    const timer = window.setInterval(onChange, 60_000)
    return () => {
      alive = false
      window.removeEventListener(EVENT, onChange)
      window.clearInterval(timer)
    }
  }, [enabled])
  return enabled ? count : 0
}

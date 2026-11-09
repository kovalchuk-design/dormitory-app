import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const EVENT = 'pending-updates-changed'

/** Викликати після підтвердження/відхилення/зіставлення, щоб оновити лічильники у навігації. */
export function notifyPendingChanged(): void {
  window.dispatchEvent(new Event(EVENT))
}

export interface QueueCounts {
  /** версії анкет, що чекають підтвердження */
  pending: number
  /** подання зі спільного посилання, які не вдалося зіставити з учнем */
  unmatched: number
}

/** Лічильники для навігації (лише admin/educator — для інших нулі й жодного запиту). */
export function useQueueCounts(enabled: boolean): QueueCounts {
  const [counts, setCounts] = useState<QueueCounts>({ pending: 0, unmatched: 0 })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = async () => {
      const [p, u] = await Promise.all([
        supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('intake_submissions').select('id', { count: 'exact', head: true }).eq('status', 'unmatched'),
      ])
      if (!alive) return
      setCounts({ pending: p.error ? 0 : (p.count ?? 0), unmatched: u.error ? 0 : (u.count ?? 0) })
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
  return enabled ? counts : { pending: 0, unmatched: 0 }
}

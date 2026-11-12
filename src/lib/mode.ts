import { useCallback, useSyncExternalStore } from 'react'

/** Режим застосунку на цьому пристрої: «звичайний» або спрощений «Тривога» (лише список кімнат). */
const KEY = 'dormitory-mode'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === 'alarm' } catch { return false }
}
let current = read()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function setAlarmMode(on: boolean): void {
  current = on
  try {
    if (on) localStorage.setItem(KEY, 'alarm')
    else localStorage.removeItem(KEY)
  } catch { /* сховище недоступне — режим діє лише до перезавантаження */ }
  listeners.forEach((l) => l())
}

export function useAlarmMode() {
  const alarm = useSyncExternalStore(subscribe, () => current, () => false)
  const toggle = useCallback(() => setAlarmMode(!current), [])
  return { alarm, toggle }
}

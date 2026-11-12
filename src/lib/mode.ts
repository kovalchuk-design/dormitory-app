import { useCallback, useSyncExternalStore } from 'react'

/** Режим застосунку на цьому пристрої: «звичайний» або спрощений «Обхід» (лише список кімнат). */
const KEY = 'dormitory-mode'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return ['round', 'alarm'].includes(localStorage.getItem(KEY) ?? '') } catch { return false }
}
let current = read()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function setRoundMode(on: boolean): void {
  current = on
  try {
    if (on) localStorage.setItem(KEY, 'round')
    else localStorage.removeItem(KEY)
  } catch { /* сховище недоступне — режим діє лише до перезавантаження */ }
  listeners.forEach((l) => l())
}

export function useRoundMode() {
  const round = useSyncExternalStore(subscribe, () => current, () => false)
  const toggle = useCallback(() => setRoundMode(!current), [])
  return { round, toggle }
}

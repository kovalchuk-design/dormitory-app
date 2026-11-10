import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'dormitory-theme'
const ORDER: ThemePref[] = ['system', 'light', 'dark']

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Ставить data-theme на <html>: «система» → за prefers-color-scheme. */
export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // колір системної смуги (годинник/мережа) на телефоні = верх фону сторінки, щоб не було «зеленої смужки»
  const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]')
  if (meta) meta.content = dark ? '#101C26' : '#D8ECF8'
}

/** Циклічний перемикач: система → світла → темна. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read)
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])
  const cycle = useCallback(() => {
    setPref((p) => {
      const next = ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]
      try {
        if (next === 'system') localStorage.removeItem(KEY)
        else localStorage.setItem(KEY, next)
      } catch { /* сховище недоступне — тема діє лише до перезавантаження */ }
      return next
    })
  }, [])
  return { pref, cycle }
}

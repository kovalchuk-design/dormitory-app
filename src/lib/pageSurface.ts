import { useEffect } from 'react'

/**
 * Сторінка, що на телефоні вся «біла» (публічна анкета): фон html стає кольором картки,
 * а theme-color — таким самим, щоб зони під годинником і під панеллю Safari не були синіми.
 */
export function usePageSurface(): void {
  useEffect(() => {
    const root = document.documentElement
    const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]')
    const prev = meta?.content
    root.classList.add('is-surface')
    const dark = root.dataset.theme === 'dark'
    if (meta) meta.content = dark ? '#182028' : '#FFFFFF'
    return () => {
      root.classList.remove('is-surface')
      if (meta && prev) meta.content = prev
    }
  }, [])
}

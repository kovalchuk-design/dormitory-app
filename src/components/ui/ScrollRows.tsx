import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useScrollThumb } from './useScrollThumb'

export const LIST_ROWS = 7

/**
 * Довгий список: показує рівно `rows` рядків, решта в прокрутці з власним повзунком; під списком підпис
 * «Показано 7, ще N нижче» (docs/style.md §7.6, §10). Висота міряється по справжніх рядках.
 */
export function ScrollRows({
  rows = LIST_ROWS,
  item,
  className,
  inset = true,
  moreLabel = (shown: number, more: number) => `Показано ${shown}, ще ${more} нижче: прокрутіть список`,
  children,
}: {
  rows?: number
  item?: string
  className?: string
  inset?: boolean
  moreLabel?: (shown: number, more: number) => string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>()
  const [more, setMore] = useState(0)
  const { thumb, place, drag, dragging } = useScrollThumb(ref, 0, 0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rowsOf = () => Array.from(item ? el.querySelectorAll<HTMLElement>(item) : (el.firstElementChild?.children as HTMLCollectionOf<HTMLElement>) ?? [])
    const measure = () => {
      const items = rowsOf()
      setMore(Math.max(0, items.length - rows))
      if (items.length <= rows) setHeight(undefined)
      else setHeight(Math.ceil(items[rows - 1].getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop) + 6)
      place()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    rowsOf().slice(0, rows).forEach((r) => ro.observe(r))
    return () => ro.disconnect()
  })

  return (
    <>
      <div className={`sr-area sr-wrap${inset ? ' inset' : ''}${dragging ? ' dragging' : ''}`}>
        <div ref={ref} className={`scrollrows ${className ?? ''}`} style={height ? { maxHeight: height } : undefined} onScroll={place}>
          {children}
        </div>
        {thumb && <div className="sr-thumb" style={{ top: thumb.top, right: thumb.right, height: thumb.h }} onPointerDown={drag} aria-hidden="true" />}
      </div>
      {more > 0 && <div className="small muted scrollmore">{moreLabel(rows, more)}</div>}
    </>
  )
}

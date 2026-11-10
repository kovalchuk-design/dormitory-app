import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { useScrollThumb } from './useScrollThumb'

/** Панель, що прокручується цілком: зовнішній елемент не скролиться, внутрішній `.scrollrows` скролиться з власним повзунком (docs/style.md §7, §10). */
export function ScrollArea({ as: Tag = 'div', className, body, inset = 0, children, ...rest }:
  { as?: 'div' | 'aside' | 'section'; className?: string; body?: string; inset?: number; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const { thumb, place, drag, dragging } = useScrollThumb(ref, inset)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c))
    return () => ro.disconnect()
  })
  return (
    <Tag className={`sr-area ${className ?? ''}${dragging ? ' dragging' : ''}`} {...rest}>
      <div ref={ref} className={`scrollrows ${body ?? ''}`} onScroll={place}>{children}</div>
      {thumb && <div className="sr-thumb" style={{ top: thumb.top, right: thumb.right, height: thumb.h }} onPointerDown={drag} aria-hidden="true" />}
    </Tag>
  )
}

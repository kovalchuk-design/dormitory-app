import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from './icons'

/**
 * Інфо-іконка: довге пояснення ховається в підказку (docs/style.md §6).
 * Відкривається при наведенні мишею, дотиком/кліком і з клавіатури; позиціюється біля самої іконки й не виходить за екран.
 */
export function InfoTip({ id, label = 'Пояснення', children }: { id: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const mode = useRef<'hover' | 'click'>('click')
  const root = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.min(460, window.innerWidth - 24)
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12)
    // під іконкою; якщо знизу бракує місця — над нею
    const below = window.innerHeight - r.bottom
    setStyle(below < 140 && r.top > below
      ? { left, width, bottom: window.innerHeight - r.top + 8 }
      : { left, width, top: r.bottom + 8 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <span
      className={`infotip${open ? ' open' : ''}`} ref={root}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !open) { mode.current = 'hover'; setOpen(true) } }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && mode.current === 'hover') setOpen(false) }}
    >
      <button
        ref={btn} type="button" className="infotip-btn" aria-label={label} title={label} aria-expanded={open} aria-controls={id}
        onClick={() => { if (open && mode.current === 'click') setOpen(false); else { mode.current = 'click'; setOpen(true) } }}
      >
        <Icon name="info" size={16} />
      </button>
      <span id={id} role="note" className="info-pop" style={open ? style : undefined}>{children}</span>
    </span>
  )
}

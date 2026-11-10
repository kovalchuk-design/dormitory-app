import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export interface ActionItem {
  label: string
  /** Перехід за адресою… */
  to?: string
  /** …або дія. */
  onClick?: () => void
}

/**
 * Кнопка «+ Додати» з випадним меню: відкривається при наведенні мишею, а також кліком/дотиком і з клавіатури.
 * Якщо пункт один — це звичайна кнопка без меню.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionItem[] }) {
  const [open, setOpen] = useState(false)
  const mode = useRef<'hover' | 'click'>('click')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])

  if (items.length === 0) return null
  const run = (it: ActionItem) => { setOpen(false); it.onClick?.() }
  if (items.length === 1) {
    const it = items[0]
    return it.to
      ? <Link className="btn" to={it.to}>{label} {it.label.toLowerCase()}</Link>
      : <button type="button" onClick={() => run(it)}>{label} {it.label.toLowerCase()}</button>
  }
  return (
    <div
      ref={root} className="action-menu"
      onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; clearTimeout(timer.current); if (!open) { mode.current = 'hover'; setOpen(true) } }}
      onPointerLeave={(e) => { if (e.pointerType !== 'mouse' || mode.current !== 'hover') return; timer.current = setTimeout(() => setOpen(false), 150) }}
    >
      <button
        type="button" aria-haspopup="menu" aria-expanded={open}
        onClick={() => { if (open && mode.current === 'click') setOpen(false); else { mode.current = 'click'; setOpen(true) } }}
      >
        {label}
      </button>
      {open && (
        <div className="action-menu-pop" role="menu">
          {items.map((it) => it.to
            ? <Link key={it.label} role="menuitem" to={it.to} className="action-item" onClick={() => setOpen(false)}>{it.label}</Link>
            : <button key={it.label} type="button" role="menuitem" className="action-item" onClick={() => run(it)}>{it.label}</button>)}
        </div>
      )}
    </div>
  )
}

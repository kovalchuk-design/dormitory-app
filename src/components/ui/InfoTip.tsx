import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'

/** Інфо-іконка: довге пояснення ховається в підказку (docs/style.md §6). Працює на дотик, клік і клавіатуру. */
export function InfoTip({ id, label = 'Пояснення', children }: { id: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <span className={`infotip${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className="infotip-btn" aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon name="info" size={16} />
      </button>
      <span id={id} role="note" className="info-pop">{children}</span>
    </span>
  )
}

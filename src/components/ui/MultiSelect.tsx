import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { useScrollThumb } from './useScrollThumb'

export interface MultiOption { value: string; label: string; /** Заголовок групи: показується перед першим пунктом групи. */ group?: string }

/** Випадний список із прапорцями (можна обрати кілька). Вигляд — як у Select (docs/style.md §6). */
export function MultiSelect({ label, options, value, onChange, 'aria-label': ariaLabel }: {
  label: string
  options: MultiOption[]
  value: string[]
  onChange: (next: string[]) => void
  'aria-label'?: string
}) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const { thumb, place, drag, dragging } = useScrollThumb(list, 10)

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 240 && above > below
    const width = Math.max(r.width, 260)
    setPos({ left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8), top: up ? r.top - 6 : r.bottom + 6, width, maxH: Math.max(140, Math.min(360, up ? above : below)), up })
  }, [open])
  useLayoutEffect(() => { if (open) place() }, [open, pos, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const close = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true) } return }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(options[active].value) }
    else if (e.key === 'Tab') setOpen(false)
  }

  const selected = options.filter((o) => value.includes(o.value))
  const shown = selected.length === 0 ? label : selected.length <= 2 ? selected.map((o) => o.label).join(', ') : `${label}: ${selected.length}`
  return (
    <div className="sel">
      <button
        ref={btn} type="button" role="combobox" className="sel-trigger" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={`${uid}-list`} aria-label={ariaLabel ?? label} onClick={() => setOpen((o) => !o)} onKeyDown={onKeyDown}
      >
        <span className={selected.length ? '' : 'sel-ph'}>{shown}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && createPortal(
        <div
          ref={pop} className={`sel-pop${dragging ? ' dragging' : ''}`}
          style={pos ? { left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), maxHeight: pos.maxH } : { visibility: 'hidden' }}
        >
          <div ref={list} id={`${uid}-list`} role="listbox" aria-multiselectable="true" aria-label={label} className="scrollrows sel-list" style={{ maxHeight: pos?.maxH }} onScroll={place}>
            {options.map((o, i) => {
              const on = value.includes(o.value)
              return (
                <div key={o.value}>
                  {o.group && o.group !== options[i - 1]?.group && <div className="sel-group" role="presentation">{o.group}</div>}
                  <div role="option" aria-selected={on} className={`sel-opt multi${i === active ? ' active' : ''}`}
                    onPointerMove={() => setActive(i)} onClick={() => toggle(o.value)}>
                    <span className={`mchk${on ? ' on' : ''}`} aria-hidden="true">{on && <Icon name="check" size={14} />}</span>
                    <span>{o.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {thumb && <div className="sr-thumb" style={{ top: thumb.top, right: thumb.right, height: thumb.h }} onPointerDown={drag} aria-hidden="true" />}
        </div>,
        document.body,
      )}
    </div>
  )
}

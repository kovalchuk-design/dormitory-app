import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { useScrollThumb } from './useScrollThumb'

interface Opt { value: string; label: string; disabled: boolean; group?: string }

function text(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(text).join('')
  if (isValidElement(n)) return text((n.props as { children?: ReactNode }).children)
  return ''
}

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const el = c as ReactElement<{ value?: string | number; disabled?: boolean; label?: string; children?: ReactNode }>
    if (el.type === 'option') {
      out.push({ value: String(el.props.value ?? text(el.props.children)), label: text(el.props.children), disabled: !!el.props.disabled, group })
    } else if (el.type === 'optgroup') collect(el.props.children, el.props.label, out)
    else collect(el.props.children, group, out)
  })
  return out
}

export interface SelectProps {
  value: string | number
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode
  id?: string
  name?: string
  className?: string
  disabled?: boolean
  autoFocus?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Випадний список замість рідного <select> (docs/style.md §6): API сумісний — value, onChange(e.target.value), <option>/<optgroup>. */
export function Select({ value, onChange, children, id, name, className = '', disabled, autoFocus, ...aria }: SelectProps) {
  const uid = useId()
  const opts = useMemo(() => collect(children), [children])
  const cur = opts.find((o) => o.value === String(value))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const { thumb, place, drag, dragging } = useScrollThumb(list, 10)

  const choose = useCallback((o: Opt) => {
    if (o.disabled) return
    setOpen(false)
    btn.current?.focus()
    if (o.value !== String(value)) onChange({ target: { value: o.value } })
  }, [onChange, value])

  const openList = () => {
    if (disabled) return
    const i = opts.findIndex((o) => o.value === String(value))
    setActive(i >= 0 ? i : Math.max(0, opts.findIndex((o) => !o.disabled)))
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 200 && above > below
    const maxH = Math.max(120, Math.min(320, up ? above : below))
    const width = Math.max(r.width, 160)
    setPos({ left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8), top: up ? r.top - 6 : r.bottom + 6, width, maxH, up })
  }, [open, opts.length])

  useLayoutEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    place()
  }, [open, active, pos, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const close = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const step = (d: 1 | -1, from = active) => {
    for (let i = from + d; i >= 0 && i < opts.length; i += d) if (!opts[i].disabled) return i
    return from
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(step(1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(step(-1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(step(1, -1)) }
    else if (e.key === 'End') { e.preventDefault(); setActive(step(-1, opts.length)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[active]) choose(opts[active]) }
    else if (e.key === 'Tab') setOpen(false)
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase()
      const i = opts.findIndex((o, idx) => idx > active && !o.disabled && o.label.toLowerCase().startsWith(k))
      const j = i >= 0 ? i : opts.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(k))
      if (j >= 0) setActive(j)
    }
  }

  return (
    <div className={`sel ${className}`}>
      {name && <input type="hidden" name={name} value={String(value)} />}
      <button
        ref={btn} id={id} type="button" role="combobox" className="sel-trigger" disabled={disabled} autoFocus={autoFocus}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-o${active}` : undefined}
        aria-label={aria['aria-label']} aria-invalid={aria['aria-invalid']} aria-describedby={aria['aria-describedby']}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}
      >
        <span className={cur && cur.value !== '' ? '' : 'sel-ph'}>{cur?.label ?? ''}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && createPortal(
        <div
          ref={pop} className={`sel-pop${dragging ? ' dragging' : ''}`}
          style={pos ? { left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), maxHeight: pos.maxH, visibility: 'visible' } : { visibility: 'hidden' }}
        >
          <div ref={list} id={`${uid}-list`} role="listbox" className="scrollrows sel-list" style={{ maxHeight: pos?.maxH }} onScroll={place} aria-label={aria['aria-label']}>
            {opts.map((o, i) => {
              const head = o.group && o.group !== opts[i - 1]?.group ? <div className="sel-group" role="presentation">{o.group}</div> : null
              return (
                <div key={o.value + i}>
                  {head}
                  <div
                    id={`${uid}-o${i}`} data-i={i} role="option" aria-selected={o.value === String(value)} aria-disabled={o.disabled || undefined}
                    className={`sel-opt${i === active ? ' active' : ''}${o.disabled ? ' disabled' : ''}`}
                    onPointerMove={() => !o.disabled && setActive(i)} onClick={() => choose(o)}
                  >
                    <span>{o.label}</span>
                    {o.value === String(value) && o.value !== '' && <Icon name="check" size={16} />}
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

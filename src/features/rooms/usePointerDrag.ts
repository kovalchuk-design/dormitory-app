import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { DropTarget, Pupil } from './logic'

export interface DragItem {
  pupil: Pupil
  fromRoomId: string | null
}

export interface DragState {
  item: DragItem
  x: number
  y: number
  over: DropTarget | null
}

const THRESHOLD_PX = 5
const EDGE_PX = 70
const SCROLL_STEP = 18

/** Ціль під вказівником: елемент з атрибутом data-drop="pool" | "room:<id>". */
export function targetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  const v = el?.dataset.drop
  if (!v) return null
  if (v === 'pool') return { kind: 'pool' }
  return v.startsWith('room:') ? { kind: 'room', roomId: v.slice(5) } : null
}

/**
 * Перетягування мишею/тачпадом/пером на pointer-подіях (без бібліотек).
 * Дотик (телефон) не перехоплюється — щоб не заважати прокрутці; там є кнопка «Перемістити».
 * Esc скасовує перетягування; біля верхнього/нижнього краю вікна сторінка прокручується.
 */
export function usePointerDrag(handlers: { onStart: () => void; onDrop: (item: DragItem, target: DropTarget) => void }) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), [])

  const begin = useCallback((e: ReactPointerEvent, item: DragItem) => {
    if (e.button !== 0 || e.pointerType === 'touch') return
    stopRef.current?.()
    const startX = e.clientX
    const startY = e.clientY
    let x = startX
    let y = startY
    let active = false
    let timer: ReturnType<typeof setInterval> | undefined

    const update = () => setDrag({ item, x, y, over: targetAt(x, y) })

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      clearInterval(timer)
      document.body.classList.remove('rm-dragging')
      stopRef.current = null
      setDrag(null)
    }
    const onMove = (ev: PointerEvent) => {
      x = ev.clientX
      y = ev.clientY
      if (!active) {
        if (Math.hypot(x - startX, y - startY) < THRESHOLD_PX) return
        active = true
        document.body.classList.add('rm-dragging')
        handlersRef.current.onStart()
        timer = setInterval(() => {
          // у блоці зі своєю прокруткою (поверх) гортаємо його, інакше — вікно
          const box = document.elementFromPoint(x, y)?.closest<HTMLElement>('.scrollrows')
          const r = box?.getBoundingClientRect()
          if (box && r && y < r.top + EDGE_PX && box.scrollTop > 0) box.scrollTop -= SCROLL_STEP
          else if (box && r && y > r.bottom - EDGE_PX && box.scrollTop + box.clientHeight < box.scrollHeight) box.scrollTop += SCROLL_STEP
          else if (y < EDGE_PX) window.scrollBy(0, -SCROLL_STEP)
          else if (y > window.innerHeight - EDGE_PX) window.scrollBy(0, SCROLL_STEP)
          else return
          update() // після прокрутки ціль під вказівником змінилась
        }, 16)
      }
      update()
    }
    const onUp = (ev: PointerEvent) => {
      const wasActive = active
      const target = wasActive ? targetAt(ev.clientX, ev.clientY) : null
      cleanup()
      if (!wasActive) return
      // браузер надсилає click після відпускання кнопки — гасимо його (інакше спрацює кнопка під курсором)
      const swallow = (c: MouseEvent) => {
        c.stopPropagation()
        c.preventDefault()
      }
      window.addEventListener('click', swallow, true)
      setTimeout(() => window.removeEventListener('click', swallow, true), 0)
      if (target) handlersRef.current.onDrop(item, target)
    }
    const onCancel = () => cleanup()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cleanup()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    stopRef.current = cleanup
  }, [])

  return { drag, begin }
}

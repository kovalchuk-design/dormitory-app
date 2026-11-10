import { useCallback, useState, type PointerEvent, type RefObject } from 'react'

/** Права кромка повзунка стоїть на цій відстані від видимого краю свого блоку, на всіх сторінках (docs/style.md §7). */
export const SCROLL_EDGE = 8

/** Блок, з яким вирівнюємо повзунок: сам скролбокс або найближчий предок із рамкою чи фоном. */
function edgeBlock(el: HTMLElement): HTMLElement {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n)
    const bg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'
    if (parseFloat(cs.borderRightWidth) > 0 || bg || cs.backgroundImage !== 'none') return n
  }
  return el
}

/** `inset` тримає повзунок осторонь закруглених кутів; `head` резервує верх під липку шапку таблиці. */
export function useScrollThumb(ref: RefObject<HTMLElement | null>, inset = 0, head = 0) {
  const [thumb, setThumb] = useState<{ top: number; right: number; h: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const place = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const track = clientHeight - 2 * inset - head
    // Цілі пікселі й той самий об'єкт, якщо нічого не змінилось: інакше виклик після рендеру зациклиться.
    const next = scrollHeight <= clientHeight + 1 || track <= 0 ? null : (() => {
      const h = Math.round(Math.max(32, (track * clientHeight) / scrollHeight))
      const host = (el.offsetParent as HTMLElement | null) ?? el
      const hostEdge = host.getBoundingClientRect().right - parseFloat(getComputedStyle(host).borderRightWidth)
      const right = Math.round(SCROLL_EDGE - (edgeBlock(el).getBoundingClientRect().right - hostEdge))
      return { top: el.offsetTop + inset + head + Math.round((scrollTop / (scrollHeight - clientHeight)) * (track - h)), right, h }
    })()
    setThumb((prev) => (prev === next || (prev && next && prev.top === next.top && prev.right === next.right && prev.h === next.h) ? prev : next))
  }, [ref, inset, head])

  const drag = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el || !thumb) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    const y0 = e.clientY
    const s0 = el.scrollTop
    const ratio = (el.scrollHeight - el.clientHeight) / (el.clientHeight - 2 * inset - head - thumb.h)
    const move = (m: globalThis.PointerEvent) => { el.scrollTop = s0 + (m.clientY - y0) * ratio }
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return { thumb, place, drag, dragging }
}

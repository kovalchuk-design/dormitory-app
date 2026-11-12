/**
 * На дотикових екранах повзунок прокрутки (.sr-thumb) показується лише під час прокручування і ~1 с після нього.
 * Прокрутка не спливає, тому слухаємо в фазі перехоплення; позначаємо сам .scrollrows атрибутом data-scrolling (див. base.css).
 */
const HIDE_AFTER_MS = 1000
const timers = new WeakMap<HTMLElement, number>()

export function installScrollHint(): void {
  document.addEventListener('scroll', (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.classList.contains('scrollrows')) return
    el.setAttribute('data-scrolling', '')
    window.clearTimeout(timers.get(el))
    timers.set(el, window.setTimeout(() => el.removeAttribute('data-scrolling'), HIDE_AFTER_MS))
  }, true)
}

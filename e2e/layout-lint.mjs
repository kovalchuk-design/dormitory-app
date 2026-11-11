// Автоаналіз верстки всіх екранів на трьох ширинах: накладання інтерактивних елементів, «злиплі» елементи (зазор < 6px між сусідніми
// кнопками/полями), обрізаний текст, дрібні зони дотику на телефоні, горизонтальний скрол. Запуск: node e2e/layout-lint.mjs
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const ID = '00000000-0000-4000-8000-000000000001'
const routes = ['#/hostel/rooms', '#/hostel/students', '#/students/' + ID, '#/students/new', '#/students/' + ID + '/edit', '#/updates', '#/collect', '#/documents', '#/admin', '#/password', '#/form/abc']
const sizes = [['360', { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }], ['768', { viewport: { width: 768, height: 1024 }, hasTouch: true }], ['1440', { viewport: { width: 1440, height: 900 } }]]
const browser = await chromium.launch()
const out = []
for (const [sn, opts] of sizes) for (const route of routes) {
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 })
  await installMock(ctx, { signedIn: !route.startsWith('#/form') })
  const page = await ctx.newPage()
  await page.goto(BASE + route); await page.waitForTimeout(900)
  const res = await page.evaluate((mobile) => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (!(b.width > 2 && b.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none') || e.closest('.sr-only,[aria-hidden=true]')) return false
      // справді видимий: центр у межах вікна і не прихований прокруткою/іншим шаром
      const cx = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1), cy = b.top + b.height / 2
      if (cy < 0 || cy > innerHeight - 1) return false
      const hit = document.elementFromPoint(cx, cy)
      return !!hit && (e === hit || e.contains(hit) || hit.contains(e)) }
    const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}«${(e.textContent || e.getAttribute('aria-label') || e.value || '').trim().slice(0, 22)}»`
    const els = [...document.querySelectorAll('a[href]:not(.sl-row),button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,summary')].filter(vis)
    const issues = []
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j]
      if (a.contains(b) || b.contains(a)) continue
      // елементи в різних «шарах» (меню/діалог поверх сторінки) не порівнюємо
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (ox > 2 && oy > 2) { issues.push(`НАКЛАДАННЯ ${name(a)} ↔ ${name(b)}`); continue }
      // злипання: перекриваються по одній осі, по іншій зазор 0..5px
      const gapY = Math.max(ra.top, rb.top) - Math.min(ra.bottom, rb.bottom), gapX = Math.max(ra.left, rb.left) - Math.min(ra.right, rb.right)
      if (ox > 8 && gapY >= -1 && gapY < 6 && !a.closest('.tabs-m,.rail') ) issues.push(`ЗЛИПЛИСЬ↕ ${gapY.toFixed(0)}px ${name(a)} / ${name(b)}`)
      else if (oy > 8 && gapX >= -1 && gapX < 4 && !a.closest('.tabs-m,.rail,.seg,.tabs,.view-switch,.sl-chips,.chip-group,.rm-tabs')) issues.push(`ЗЛИПЛИСЬ↔ ${gapX.toFixed(0)}px ${name(a)} / ${name(b)}`)
    }
    // обрізаний текст у кнопках/мітках
    for (const e of document.querySelectorAll('button,a.btn,label,h1,h2,h3,.tag,.tab')) {
      if (!vis(e)) continue
      const cs = getComputedStyle(e)
      if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis') issues.push(`ОБРІЗАНО ${name(e)}`)
    }
    if (mobile) for (const e of els) { const b = e.getBoundingClientRect(); if ((b.height < 40 || b.width < 40) && e.tagName !== 'INPUT' && !e.closest('.sr-thumb')) issues.push(`ДРІБНА_ЗОНА ${Math.round(b.width)}x${Math.round(b.height)} ${name(e)}`) }
    const h = document.documentElement.scrollWidth - innerWidth
    if (h > 0) issues.push(`ГОРИЗОНТАЛЬНИЙ_СКРОЛ ${h}px`)
    return [...new Set(issues)]
  }, sn === '360')
  for (const r of res) out.push(`${sn} ${route}  ${r}`)
  await ctx.close()
}
console.log(out.join('\n') || 'layout-lint: OK')
console.log(`\nвсього: ${out.length}`)
await browser.close()

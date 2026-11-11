// Огляд усіх екранів на телефоні: біля верхнього й нижнього країв не має бути «чужої» білої/чорної смуги,
// колір має збігатися з фоном сторінки (градієнт) або з білою поверхнею (публічна анкета). Світла й темна теми, початок і кінець прокрутки.
import assert from 'node:assert/strict'
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const ID = '00000000-0000-4000-8000-000000000001'
const routes = [
  ['#/hostel/rooms', true], ['#/hostel/students', true], ['#/students/' + ID, true], ['#/students/new', true], ['#/students/' + ID + '/edit', true],
  ['#/updates', true], ['#/collect', true], ['#/documents', true], ['#/admin', true], ['#/password', true], ['#/nope', true],
  ['#/login', false], ['#/form/abc', false],
]
const browser = await chromium.launch()
const decoder = await (await browser.newContext()).newPage()
const edges = (buf) => decoder.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3)
  return { top: at(2, 2), bottom: at(2, img.height - 3), topR: at(img.width - 3, 2), bottomR: at(img.width - 3, img.height - 3) }
}, buf.toString('base64'))
const problems = []
for (const scheme of ['light', 'dark']) for (const [route, signedIn] of routes) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, deviceScaleFactor: 1 })
  await installMock(ctx, { signedIn })
  const page = await ctx.newPage()
  await page.goto(BASE + route); await page.waitForTimeout(900)
  const info = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, hscroll: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText.slice(0, 40).replace(/\n/g, ' ') }))
  let tr0, tg0, tb0
  for (const pos of ['top', 'bottom']) {
    if (pos === 'bottom') await page.evaluate(() => { window.scrollTo(0, 1e6); document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible' && e.closest('.content') === null) e.scrollTop = 1e6 }) })
    const e = await edges(await page.screenshot())
    if (pos === 'top') [tr0, tg0, tb0] = e.top
    for (const [k, v] of Object.entries(e)) {
      const [r, g, b] = v
      const white = r > 250 && g > 250 && b > 250, black = r < 6 && g < 6 && b < 6
      const isForm = route.startsWith('#/form') && signedIn === false
      if (!isForm && signedIn && Math.abs(r - tr0) + Math.abs(g - tg0) + Math.abs(b - tb0) > 6) problems.push(`${scheme} ${route} ${pos}/${k}: край ${v} ≠ верх ${[tr0, tg0, tb0]} (шов фону)`)
      if (!isForm && (scheme === 'light' ? white : black)) problems.push(`${scheme} ${route} ${pos}/${k}: ${v}`)
    }
  }
  if (info.hscroll > 0) problems.push(`${scheme} ${route}: горизонтальний скрол ${info.hscroll}px`)
  console.log(scheme.padEnd(5), route.slice(0, 40).padEnd(42), 'html', info.html, '|', info.text)
  await ctx.close()
}
console.log(problems.length ? 'ПРОБЛЕМИ:\n' + problems.join('\n') : 'edges: OK')
await browser.close()
process.exit(problems.length ? 1 : 0)

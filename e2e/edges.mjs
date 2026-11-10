// Перевірка країв екрана на телефоні: зверху й знизу не має бути білої/чорної смуги (колір має бути з фону сторінки) — світла й темна теми.
import assert from 'node:assert/strict'
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const browser = await chromium.launch()
// піксель із PNG-скріншота без залежностей: декодуємо в браузері через canvas
const decoder = await (await browser.newContext()).newPage()
const edges = async (buf) => decoder.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3)
  return { top: at(2, 2), bottom: at(2, img.height - 3) }
}, buf.toString('base64'))
for (const scheme of ['light', 'dark']) for (const route of ['#/hostel/rooms', '#/hostel/students', '#/documents']) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, deviceScaleFactor: 1 })
  await installMock(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE + route); await page.waitForTimeout(900)
  const info = await page.evaluate(() => {
    const cs = (e, p) => getComputedStyle(e)[p]
    const before = getComputedStyle(document.body, '::before')
    return { htmlBg: cs(document.documentElement, 'backgroundColor'), bodyBg: cs(document.body, 'backgroundColor'), beforeH: before.height, vh: innerHeight, theme: document.documentElement.dataset.theme }
  })
  const e = await edges(await page.screenshot())
  const [tr, tg, tb] = e.top; const [br, bg, bb] = e.bottom
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  console.log(scheme, route, JSON.stringify(info), 'top', [tr, tg, tb].join(','), 'bottom', [br, bg, bb].join(','))
  if (scheme === 'light') { assert.ok(lum(tr, tg, tb) < 245 && lum(br, bg, bb) < 245, 'світла: без білої смуги по краях'); assert.notEqual(info.htmlBg, 'rgba(0, 0, 0, 0)') }
  else { assert.ok(lum(tr, tg, tb) > 8 && lum(br, bg, bb) > 8, 'темна: без чорної смуги по краях'); assert.notEqual(info.htmlBg, 'rgba(0, 0, 0, 0)') }
  await ctx.close()
}
await browser.close()
console.log('edges: OK')

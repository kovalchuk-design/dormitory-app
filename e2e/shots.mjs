// Скріншоти списку студентів: мобільний 390x844 і десктоп 1440. Використання: E2E_BASE=… node e2e/shots.mjs <префікс>
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const tag = process.argv[2] ?? 'after'
const browser = await chromium.launch()
for (const [name, opts] of [['mobile', { ...devices['iPhone 13'], deviceScaleFactor: 2 }], ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]]) {
  const ctx = await browser.newContext(opts)
  await installMock(ctx)
  const page = await ctx.newPage()
  await page.goto(`${BASE}#/hostel/students`)
  await page.waitForSelector('tbody tr, .sl-row')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `ux-audit/shots/students-${name}-${tag}.png` })
  await ctx.close()
}
await browser.close()

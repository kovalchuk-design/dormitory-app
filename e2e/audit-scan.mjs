// Автоматичний огляд екранів на вузьких в'юпортах: горизонтальний скрол, малі зони дотику, поля без підпису.
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const routes = ['#/hostel/rooms', '#/hostel/students', '#/students/00000000-0000-4000-8000-000000000001', '#/students/new', '#/updates', '#/collect', '#/documents', '#/admin', '#/password', '#/login', '#/form/abc']
const browser = await chromium.launch()
for (const [name, dev] of [['360', { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }], ['pixel7', devices['Pixel 7']]]) {
  const ctx = await browser.newContext(dev)
  await installMock(ctx)
  const page = await ctx.newPage()
  for (const r of routes) {
    await page.goto(BASE + r); await page.waitForTimeout(700)
    const res = await page.evaluate(() => {
      const vw = window.innerWidth
      const small = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],summary')]
        .filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && (b.height < 40 || b.width < 40) && !e.closest('.sr-only') && !(e.className+'').includes('sr-thumb') })
        .map((e) => `${e.tagName.toLowerCase()}.${(e.className + '').split(' ')[0]}[${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}] ${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 25)}`)
      const unlabeled = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter((e) => !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).length
      return { hscroll: document.documentElement.scrollWidth - vw, small: small.slice(0, 8), smallN: small.length, unlabeled, text: document.body.innerText.slice(0, 80).replace(/\n/g, ' | ') }
    })
    console.log(name, r, JSON.stringify(res))
  }
  await page.screenshot({ path: `/tmp/scan-${name}.png` })
  await ctx.close()
}
await browser.close()

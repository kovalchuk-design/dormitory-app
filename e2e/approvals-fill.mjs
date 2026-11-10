// Сценарій: «Оновлення даних» — одна біла плашка на висоту екрана, сторінка не гортається, анкети гортаються всередині.
import assert from 'node:assert/strict'
import { chromium, devices, installMock, makeData } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const data = makeData()
const many = Array.from({ length: 10 }, (_, i) => ({ ...data.profiles[i % 2], id: `pp${i}`, status: 'pending', version_no: 2, submitted_at: '2026-11-09T10:00:00Z', mother_name: `ТЕСТ Мама ${i}`, father_name: null, students: data.students[i % 2] }))
const browser = await chromium.launch()
for (const [name, opts] of [['mobile', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext(opts)
  await installMock(ctx, { data, overrides: (url) => (url.pathname === '/rest/v1/student_profiles' && url.searchParams.get('status') === 'eq.pending' ? { body: many } : null) })
  const page = await ctx.newPage()
  await page.goto(`${BASE}#/forms/updates`)
  await page.locator('.ap-item').first().waitFor()
  const m = await page.evaluate(() => {
    const sc = document.querySelector('.ap-scroll > .scrollrows'), box = document.querySelector('.ap-scroll').getBoundingClientRect()
    return { items: document.querySelectorAll('.ap-item').length, docH: document.documentElement.scrollHeight, winH: innerHeight, boxBottom: box.bottom, boxH: box.height, innerScroll: sc.scrollHeight > sc.clientHeight }
  })
  console.log(name, JSON.stringify(m))
  assert.equal(m.items, 10)
  assert.ok(m.docH <= m.winH + 1, `${name}: сторінка не гортається (${m.docH} > ${m.winH})`)
  assert.ok(m.innerScroll, `${name}: анкети гортаються всередині плашки`)
  assert.ok(m.boxBottom <= m.winH, `${name}: плашка в межах екрана`)
  await page.screenshot({ path: `/tmp/claude-0/ap-fill-${name}.png` })
  await ctx.close()
}
await browser.close()
console.log('approvals-fill: OK')

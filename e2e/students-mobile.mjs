// Сценарій: мобільний список «Студенти». Запуск: npx vite --port 5199 (з VITE_SUPABASE_URL=http://mock.local) і node e2e/students-mobile.mjs
import assert from 'node:assert/strict'
import { chromium, devices, installMock, MOCK_URL } from './mock.mjs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
await installMock(ctx)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}#/hostel/students`)
await page.locator('.sl-row').first().waitFor()

const rows = page.locator('.sl-row')
assert.equal(await rows.count(), 250, 'усі 250 рядків')
const box = await rows.first().boundingBox()
assert.ok(box.height >= 44, `висота рядка ≥44 (${box.height})`)
assert.match(await page.locator('.sl-sub').first().innerText(), /^(\d пов\. · к\. \d+ · гр\. \d+|без кімнати · гр\. \d+)$/)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'немає горизонтального скролу')
await page.screenshot({ path: process.env.SHOT_LIST ?? 'ux-audit/shots/students-mobile-after.png' })

// пошук + лічильник + скидання
await page.fill('#sl-q', 'ТЕСТ_Коваленко')
const found = await rows.count()
assert.ok(found > 0 && found < 250)
assert.match(await page.locator('.sl-count').innerText(), new RegExp(`Знайдено ${found} з 250`))
await page.getByRole('button', { name: 'Скинути', exact: true }).click()
assert.equal(await rows.count(), 250)

// чіпси і бейдж
await page.getByRole('button', { name: '4 пов.' }).click()
await page.getByRole('button', { name: 'Нерозподілені' }).first().click()
assert.equal((await page.locator('.sl-filter-btn .sl-badge').innerText()).trim(), '2')
for (const t of await page.locator('.sl-sub').allInnerTexts()) assert.match(t, /^без кімнати/)
await page.getByRole('button', { name: 'Скинути', exact: true }).click()

// нижній лист фільтрів
await page.getByRole('button', { name: /Фільтри/ }).click()
await page.getByRole('dialog', { name: 'Фільтри' }).waitFor()
await page.getByLabel('Сирота', { exact: true }).check()
await page.screenshot({ path: process.env.SHOT_SHEET ?? 'ux-audit/shots/students-mobile-sheet.png' })
await page.getByRole('button', { name: /Показати/ }).click()
assert.ok((await rows.count()) < 250)
await page.getByRole('button', { name: 'Скинути', exact: true }).click()

// клік по рядку відкриває картку (шухляду), фільтри не губляться
await page.fill('#sl-q', 'ТЕСТ_Мельник')
await rows.first().click()
await page.getByRole('dialog', { name: 'Картка учня' }).waitFor()
await page.keyboard.press('Escape')
assert.equal(await page.inputValue('#sl-q'), 'ТЕСТ_Мельник')

assert.deepEqual(errors, [])
await browser.close()
console.log('students-mobile: OK')

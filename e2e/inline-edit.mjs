// Сценарій: «Редагувати» відкриває форму в тій самій картці (без переходу на іншу сторінку), з усіма полями анкети.
import assert from 'node:assert/strict'
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const id = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const browser = await chromium.launch()
for (const [name, opts] of [['mobile', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext(opts)
  await installMock(ctx)
  const page = await ctx.newPage()
  await page.goto(`${BASE}#/students/${id(1)}`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  const url = page.url()
  await page.getByRole('button', { name: 'Редагувати' }).click()
  await page.getByLabel('Прізвище *').waitFor()
  assert.equal(page.url(), url, `${name}: адреса не змінилась`)
  for (const l of ['Номер групи', 'Професія', 'Адреса проживання', 'Алергії', 'Примітка']) assert.ok(await page.getByText(l).first().count(), `${name}: поле «${l}»`)
  await page.screenshot({ path: `/tmp/claude-0/inline-edit-${name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Скасувати' }).click()
  await page.getByRole('button', { name: 'Редагувати' }).waitFor()
  await ctx.close()
}
await browser.close()
console.log('inline-edit: OK')

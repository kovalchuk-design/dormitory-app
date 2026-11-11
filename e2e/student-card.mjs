// Сценарій: проста картка учня — без «Оновлення даних», «Історії кімнат», «Версій анкети»; медична інформація завжди відкрита й лише якщо є.
import assert from 'node:assert/strict'
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const id = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const browser = await chromium.launch()
for (const [name, opts] of [['mobile', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext(opts)
  await installMock(ctx)
  const page = await ctx.newPage()
  for (const [i, hasMed] of [[0, false], [1, true]]) {
    await page.goto(`${BASE}#/students/${id(i)}`)
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.getByText('Контакти').first().waitFor()
    const text = await page.locator('main').innerText()
    for (const t of ['Активні посилання', 'Історія кімнат', 'Версії анкети']) assert.ok(!text.includes(t), `${name}: немає «${t}»`)
    assert.equal(await page.locator('details').count(), 0, `${name}: нічого не згортається`)
    const med = page.getByRole('heading', { name: 'Медична інформація' })
    assert.equal(await med.count(), hasMed ? 1 : 0, `${name}: медична інформація ${hasMed ? 'є' : 'прихована'}`)
    if (hasMed) { assert.ok(await page.getByText('Пилок (тест)').isVisible()); assert.ok(!text.includes('Хронічні хвороби'), 'порожні поля не показуємо') }
  }
  await ctx.close()
}
await browser.close()
console.log('student-card: OK')

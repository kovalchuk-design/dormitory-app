// Сценарій: меню акаунта (одна іконка) на телефоні й десктопі; діалог «Права адміністратора» не обрізається.
import assert from 'node:assert/strict'
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const browser = await chromium.launch()
for (const [name, opts, pin] of [['mobile', { ...devices['iPhone 13'] }, true], ['mobile-nopin', { ...devices['iPhone 13'] }, false], ['desktop', { viewport: { width: 1440, height: 900 } }, false]]) {
  const ctx = await browser.newContext(opts)
  await installMock(ctx, { overrides: (url) => (pin && url.pathname.endsWith('/rpc/my_session_is_pin') ? { body: true } : null) })
  const page = await ctx.newPage()
  await page.goto(`${BASE}#/hostel/students`)
  const btn = page.getByRole('button', { name: /^Акаунт/ }).filter({ visible: true })
  await btn.first().waitFor()
  await btn.first().click()
  const menu = page.getByRole('menu')
  await menu.waitFor()
  const vp = page.viewportSize()
  const box = await menu.boundingBox()
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, `${name}: меню в межах екрана`)
  assert.equal(await page.getByRole('menuitem', { name: 'Вийти' }).count(), 1)
  assert.equal(await page.getByRole('menuitem', { name: 'Змінити пароль' }).count(), pin ? 0 : 1)
  assert.equal(await page.getByRole('menuitem', { name: /Тема/ }).count(), 1)
  await page.screenshot({ path: `ux-audit/shots/account-menu-${name}.png` })
  if (pin) {
    await page.getByRole('menuitem', { name: 'Права адміністратора' }).click()
    const dlg = page.getByRole('dialog', { name: 'Права адміністратора' })
    await dlg.waitFor()
    const d = await dlg.boundingBox()
    assert.ok(d.y >= 0 && d.y + d.height <= vp.height && d.x >= 0 && d.x + d.width <= vp.width, 'діалог не обрізаний')
  }
  await ctx.close()
}
await browser.close()
console.log('account-menu: OK')

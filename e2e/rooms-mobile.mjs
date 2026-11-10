// Сценарій: «Нерозподілені» на телефоні згорнуті, розгортаються по натисненню; меню — плашка з відступами від країв.
import assert from 'node:assert/strict'
import { chromium, devices, installMock } from './mock.mjs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199/dormitory-app/'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
await installMock(ctx)
const page = await ctx.newPage()
await page.goto(`${BASE}#/hostel/rooms`)
const toggle = page.getByRole('button', { name: /Нерозподілені/ })
await toggle.waitFor()
assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
assert.equal(await page.locator('.rm-pool .rm-pupil').count(), 0, 'згорнуто — учнів не видно')
await toggle.click()
assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
assert.ok((await page.locator('.rm-pool .rm-pupil').count()) > 0)
const bar = await page.locator('.tabs-m').boundingBox()
assert.ok(bar.x >= 8 && 390 - (bar.x + bar.width) >= 8 && 844 - (bar.y + bar.height) >= 8, 'меню не притиснуте до країв')
await browser.close()
console.log('rooms-mobile: OK')

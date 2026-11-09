// Перед повторним запуском скинути проживання тест-учнів (SQL) — скрипт очікує, що всі в пулі.
// Сценарій 5: кімнати, drag-and-drop, кнопка «Перемістити», клавіатура, історія, ролі, реальний час.
const h = require('./helpers.cjs')
const P = { a: 'ТЕСТ_Перший', b: 'ТЕСТ_Другий', c: 'ТЕСТ_Третій' }

const chip = (page, n) => page.locator('li.rm-pupil', { hasText: n })
const notice = (page) => page.getByTestId('notice')
const occ = async (page, room) => (await page.getByTestId(`occ-${room}`).innerText()).trim()

async function openRooms(page, floor) {
  await page.goto(h.url('/rooms'))
  await page.getByRole('heading', { name: 'Кімнати' }).waitFor()
  await tab(page, floor)
}
async function confirmDialog(page, reason) {
  const d = page.getByRole('dialog')
  await d.getByText('Підтвердити переміщення?').waitFor()
  if (reason) await d.getByLabel(/Причина/).fill(reason)
  await d.getByRole('button', { name: 'Підтвердити' }).click()
  await d.waitFor({ state: 'detached' })
}
async function moveViaButton(page, name, roomNumber) {
  await chip(page, name).getByRole('button', { name: 'Перемістити' }).click()
  const sel = page.getByLabel('Нове місце')
  const val = await sel.locator('option', { hasText: new RegExp('^' + roomNumber + ' ') }).first().getAttribute('value')
  await sel.selectOption(val)
  await page.getByRole('button', { name: 'Далі' }).click()
  await confirmDialog(page, 'ТЕСТ кнопка')
}
async function drag(page, fromLoc, toLoc, steps = 14) {
  const a = await fromLoc.boundingBox()
  await page.mouse.move(a.x + 12, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 30, a.y + a.height / 2 + 10, { steps: 4 })
  await page.waitForTimeout(100)
  const b = await toLoc.boundingBox() // після старту перетягування: сповіщення зникає і розмітка зсувається
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps })
  await page.waitForTimeout(150)
  await page.mouse.up()
}
async function tab(page, floor) {
  const t = page.getByRole('tab', { name: `${floor} поверх` })
  if (await t.isVisible()) await t.click() // вкладки є лише на вузьких екранах
}
const nameOf = (page, n) => chip(page, n).locator('.rm-pupil-name')

;(async () => {
  const browser = await h.launch()
  const ctxA = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  const A = await ctxA.newPage(); h.watch(A, 'admin')
  await h.login(A, 'ADMIN')

  await h.check('rooms: page loads w/o error banner', async () => {
    await openRooms(A, 2)
    if (await A.locator('p.error').count()) throw new Error(await A.locator('p.error').first().innerText())
  })

  await h.check('rooms: create T901 (cap 2, floor 2) and T902 (cap 1, floor 3)', async () => {
    for (const [floor, num, cap] of [[2, 'T901', 2], [3, 'T902', 1]]) {
      if (await A.getByTestId(`room-${num}`).count()) continue
      await A.getByRole('button', { name: '+ Кімната' }).click()
      const d = A.getByRole('dialog')
      await d.getByLabel('Поверх').selectOption(String(floor))
      await d.getByLabel('Номер').fill(num)
      await d.getByLabel('Місткість').fill(String(cap))
      await d.getByRole('button', { name: 'Створити' }).click()
      await d.waitFor({ state: 'detached' })
      await A.getByTestId(`room-${num}`).waitFor()
    }
    if ((await occ(A, 'T902')) !== '0/1') throw new Error('occ ' + (await occ(A, 'T902')))
  })

  await h.check('rooms: place pupils via «Перемістити» (pool → room) with confirmation', async () => {
    await openRooms(A, 2)
    await moveViaButton(A, P.a, 'T901')
    await notice(A).getByText('переміщено').waitFor()
    await moveViaButton(A, P.b, 'T901')
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T901"]')?.textContent?.trim() === '2/2')
  })

  await h.check('rooms: drag pool → T902 (mouse) shows confirm dialog and applies', async () => {
    await tab(A, 3)
    await drag(A, nameOf(A, P.c), A.getByTestId('room-T902'))
    await confirmDialog(A, 'ТЕСТ dnd')
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T902"]')?.textContent?.trim() === '1/1')
  })

  await h.check('rooms: drop into FULL room is refused with a clear message', async () => {
    await tab(A, 2)
    // ТЕСТ_Перший (T901) → T902 (full, floor 3). Обидві кімнати мають бути видимі: ширина 1300 показує всі поверхи.
    const target = A.getByTestId('room-T902')
    if (!(await target.isVisible())) await tab(A, 3)
    await drag(A, nameOf(A, P.a), target)
    await A.waitForTimeout(500)
    if (await A.getByRole('dialog').count()) throw new Error('confirm dialog opened for a full room')
    const t = await notice(A).innerText()
    if (!/запов|місць|повн/i.test(t)) throw new Error('unclear message: ' + t)
    console.log('   notice:', t)
  })

  await h.check('rooms: unassign by dragging to «Нерозподілені» and back via button', async () => {
    await tab(A, 3)
    await drag(A, nameOf(A, P.c), A.getByTestId('pool'))
    await confirmDialog(A, 'ТЕСТ пул')
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T902"]')?.textContent?.trim() === '0/1')
    if (!(await A.getByTestId('pool').innerText()).includes(P.c)) throw new Error('not in pool')
    await moveViaButton(A, P.c, 'T902')
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T902"]')?.textContent?.trim() === '1/1')
  })

  await h.check('rooms: keyboard fallback (Space, arrows, Space) opens confirm', async () => {
    // Другий: T901 → пул (пул угорі сторінки, кроки стрілок вгору)
    await tab(A, 2)
    const el = nameOf(A, P.b)
    await el.focus()
    await A.keyboard.press('Space')
    for (let i = 0; i < 40; i++) {
      await A.keyboard.press('ArrowUp')
      await A.waitForTimeout(40)
      if ((await A.getByTestId('pool').getAttribute('class')).includes('over')) break
    }
    await A.keyboard.press('Space')
    await confirmDialog(A, 'ТЕСТ клавіатура')
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T901"]')?.textContent?.trim() === '1/2')
  })

  await h.check('rooms: capacity cannot go below occupancy (settings dialog, T901 occupied 1→2)', async () => {
    await moveViaButton(A, P.b, 'T901') // Другий з пулу назад → 2/2
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T901"]')?.textContent?.trim() === '2/2')
    await A.getByRole('button', { name: 'Налаштування кімнати T901' }).click()
    const d = A.getByRole('dialog')
    await d.getByLabel(/Місткість/).fill('1')
    await d.getByRole('alert').waitFor()
    console.log('   message:', await d.getByRole('alert').innerText())
    if (!(await d.getByRole('button', { name: 'Зберегти' }).isDisabled())) throw new Error('save enabled with capacity 1 < 2 occupants')
    await d.getByRole('button', { name: 'Скасувати' }).click()
    const dis = await A.getByLabel('Максимум місць у кімнаті T901').locator('option').evaluateAll((os) => os.map((o) => [o.value, o.disabled]))
    console.log('   dropdown options:', JSON.stringify(dis))
  })

  await h.check('rooms: history dialogs show moves (pupil + room)', async () => {
    await A.getByRole('button', { name: `Історія ${P.b}` }).click()
    let d = A.getByRole('dialog')
    await d.getByText(/T901/).first().waitFor()
    const txt = await d.innerText()
    if (!/Нерозподілені/.test(txt)) throw new Error('no pool entry in history: ' + txt.slice(0, 200))
    await d.getByRole('button', { name: 'Закрити' }).click()
    await A.getByRole('button', { name: 'Історія кімнати T901' }).click()
    d = A.getByRole('dialog')
    await d.getByText(P.a).first().waitFor()
    await d.getByRole('button', { name: 'Закрити' }).click()
  })

  await h.check('rooms: staff_readonly sees no move controls', async () => {
    const c = await browser.newContext({ viewport: { width: 1300, height: 900 } })
    const R = await c.newPage(); h.watch(R, 'readonly')
    await h.login(R, 'READONLY')
    await openRooms(R, 2)
    await R.getByText('Режим перегляду').waitFor()
    if (await R.getByRole('button', { name: 'Перемістити' }).count()) throw new Error('move buttons visible')
    if (await R.getByRole('button', { name: '+ Кімната' }).count()) throw new Error('create visible')
    await drag(R, nameOf(R, P.a), R.getByTestId('pool')).catch(() => {})
    await R.waitForTimeout(400)
    if (await R.getByRole('dialog').count()) throw new Error('readonly could open dialog by drag')
    await c.close()
  })

  await h.check('rooms: two-browser — educator move appears in admin view without reload', async () => {
    const c = await browser.newContext({ viewport: { width: 1300, height: 900 } })
    const B = await c.newPage(); h.watch(B, 'educator')
    await h.login(B, 'EDUCATOR')
    await openRooms(B, 3)
    if ((await occ(A, 'T902')) !== '1/1') throw new Error('precondition: ' + (await occ(A, 'T902')))
    await chip(B, P.c).getByRole('button', { name: 'Перемістити' }).click()
    await B.getByLabel('Нове місце').selectOption('pool')
    await B.getByRole('button', { name: 'Далі' }).click()
    await confirmDialog(B, 'ТЕСТ educator')
    const t0 = Date.now()
    await A.waitForFunction(() => document.querySelector('[data-testid="occ-T902"]')?.textContent?.trim() === '0/1', null, { timeout: 70000 })
    console.log('   propagated to other browser in', Date.now() - t0, 'ms')
    await c.close()
  })

  await browser.close()
  h.summary()
})()

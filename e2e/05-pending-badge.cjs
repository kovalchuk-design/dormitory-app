// Сценарій 3/4 (доповнення): рівно одна pending-версія після подання, значок у навігації, затвердження першої анкети.
const h = require('./helpers.cjs')
;(async () => {
  const browser = await h.launch()
  const page = await (await browser.newContext()).newPage(); h.watch(page, 'admin')
  await h.login(page, 'ADMIN')
  const name = process.env.PUPIL || 'ТЕСТ_Другий'
  await page.goto(h.url('/students'))
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Оновити дані' }).click()
  const link = await page.getByLabel('Посилання на анкету').inputValue()
  const ap = await (await browser.newContext()).newPage(); h.watch(ap, 'anon')
  await ap.goto(link)
  await ap.getByRole('heading', { name: 'Анкета мешканця гуртожитку' }).waitFor()
  const v = { full_name: name + ' Учень', birth_date: '2009-01-02', group_number: 'Т-2', profession: 'ТЕСТ', class_teacher: 'ТЕСТ', master: 'ТЕСТ', address: 'ТЕСТ адреса', student_phone: '0671234500', mother_name: 'ТЕСТ_Мама2', mother_phone: '0671234501', father_name: 'немає', school_activities: 'ТЕСТ', college_plans: 'ТЕСТ', allergies: 'немає', chronic_conditions: 'немає' }
  for (const [k, val] of Object.entries(v)) { const l = ap.locator(`[name="${k}"]`); if ((await l.getAttribute('readonly')) === null) await l.fill(val) }
  await ap.getByLabel('Жодного з переліку').check(); await ap.getByLabel(/Я погоджуюсь/).check()
  await ap.getByRole('button', { name: 'Надіслати анкету' }).click()
  await ap.getByRole('heading', { name: /Дякуємо/ }).waitFor({ timeout: 20000 })
  await h.check('badge shows pending count after reload', async () => {
    await page.goto(h.url('/updates')); await page.reload()
    await page.getByRole('heading', { name: new RegExp(name) }).waitFor()
    const b = await page.locator('nav a', { hasText: 'Оновлення даних' }).locator('.badge').innerText()
    if (!/^1/.test(b)) throw new Error('badge=' + b)
  })
  await browser.close(); h.summary()
})()

// Сценарії 2–4: учні, посилання «Оновити дані», публічна анкета без входу, підтвердження версій.
const fs = require('fs')
const h = require('./helpers.cjs')

const FILL = {
  full_name: 'ТЕСТ_Іваненко Тест Тестович', birth_date: '2009-05-05', group_number: 'Т-1', profession: 'ТЕСТ_програміст',
  class_teacher: 'ТЕСТ_Клас Керівник', master: 'ТЕСТ_Майстер', address: 'ТЕСТ вул. Тестова 1', student_phone: '067 123 45 67',
  mother_name: 'ТЕСТ_Мама', mother_phone: '+380671234568', father_name: 'немає',
  school_activities: 'ТЕСТ шахи', college_plans: 'ТЕСТ навчання', allergies: 'немає', chronic_conditions: 'немає',
}

async function fillAndSubmit(page, link, over = {}) {
  await page.goto(link)
  await page.getByRole('heading', { name: 'Анкета мешканця гуртожитку' }).waitFor()
  const v = { ...FILL, ...over }
  for (const [k, val] of Object.entries(v)) {
    const loc = page.locator(`[name="${k}"]`)
    if ((await loc.getAttribute('readonly')) !== null) continue
    await loc.fill(val)
  }
  await page.getByLabel('Жодного з переліку').check()
  await page.getByLabel(/Я погоджуюсь/).check()
  await page.getByRole('button', { name: 'Надіслати анкету' }).click()
}

async function createLink(page, studentUrl) {
  await page.goto(studentUrl)
  await page.getByRole('button', { name: 'Оновити дані' }).click()
  const inp = page.getByLabel('Посилання на анкету')
  await inp.waitFor()
  return await inp.inputValue()
}

;(async () => {
  const browser = await h.launch()
  const ctx = await browser.newContext({ acceptDownloads: true })
  const page = await ctx.newPage()
  h.watch(page, 'admin')
  await h.login(page, 'ADMIN')
  const names = ['ТЕСТ_Перший', 'ТЕСТ_Другий', 'ТЕСТ_Третій']
  const ids = {}

  await h.check('students: page loads without red banner (regression f527e84)', async () => {
    await page.goto(h.url('/students'))
    await page.getByText(/Знайдено:/).waitFor()
    if (await page.locator('.error, [role=alert]').count()) throw new Error(await page.locator('.error, [role=alert]').first().innerText())
  })

  await h.check('students: create 3 pupils via UI', async () => {
    for (const n of names) {
      await page.goto(h.url('/students/new'))
      await page.getByLabel(/Прізвище/).fill(n)
      await page.getByLabel(/Ім.я/).fill('Учень')
      await page.getByLabel('Клас *').selectOption('10')
      await page.getByRole('button', { name: 'Зберегти' }).click()
      await page.waitForURL(/#\/students\/[0-9a-f-]{36}$/)
      ids[n] = page.url().split('/').pop()
      await page.getByRole('heading', { name: new RegExp(n) }).waitFor()
    }
  })

  await h.check('students: validation — empty surname blocked', async () => {
    await page.goto(h.url('/students/new'))
    await page.getByRole('button', { name: 'Зберегти' }).click()
    await page.getByText("Обов'язкове поле").first().waitFor()
  })

  await h.check('students: search + filters + reset', async () => {
    await page.goto(h.url('/students'))
    await page.getByText(/Знайдено:/).waitFor()
    await page.getByRole('searchbox').fill('ТЕСТ_Другий')
    await page.getByText('Знайдено: 1 з').waitFor()
    await page.getByRole('searchbox').fill('')
    if (await page.getByRole('button', { name: 'Фільтри' }).isVisible()) await page.getByRole('button', { name: 'Фільтри' }).click()
    await page.locator('.filters label', { hasText: /^Клас/ }).locator('select').selectOption('9')
    await page.getByText('Нікого не знайдено.').waitFor()
    await page.locator('.filters label', { hasText: /^Клас/ }).locator('select').selectOption('10')
    await page.getByLabel('Нерозподілені').check()
    await page.getByText('Знайдено: 3 з').waitFor()
    await page.getByRole('button', { name: 'Скинути' }).click()
  })

  await h.check('students: CSV export downloads with test rows', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Експорт CSV' }).click()])
    const p = await dl.path()
    const txt = fs.readFileSync(p, 'utf8')
    if (!txt.includes('ТЕСТ_Перший')) throw new Error('csv lacks row: ' + txt.slice(0, 150))
  })

  await h.check('students: open card', async () => {
    await page.getByRole('link', { name: /ТЕСТ_Другий/ }).click()
    await page.getByRole('heading', { name: /ТЕСТ_Другий/ }).waitFor()
    await page.getByText('Затверджена анкета відсутня.').waitFor()
  })

  // --- update link + anonymous questionnaire
  const card1 = h.url(`/students/${ids['ТЕСТ_Перший']}`)
  let link
  await h.check('update link: created and shown', async () => {
    link = await createLink(page, card1)
    if (!/#\/form\/.{20,}/.test(link)) throw new Error('bad link ' + link)
  })

  const anon = await browser.newContext()
  const ap = await anon.newPage()
  h.watch(ap, 'anon')

  await h.check('public form: opens without login, no nav', async () => {
    await ap.goto(link)
    await ap.getByRole('heading', { name: 'Анкета мешканця гуртожитку' }).waitFor()
    if (await ap.getByRole('navigation').count()) throw new Error('nav visible to anon')
  })

  await h.check('public form: bad phone + missing consent are rejected', async () => {
    await ap.locator('[name="student_phone"]').fill('12345')
    await ap.getByRole('button', { name: 'Надіслати анкету' }).click()
    await ap.getByText('Перевір, будь ласка, виділені поля.').waitFor()
    const errs = await ap.locator('.field-error').allInnerTexts()
    if (!errs.length) throw new Error('no field errors')
    console.log('   field errors:', errs.slice(0, 4).join(' | '))
  })

  await h.check('public form: full submit succeeds', async () => {
    await fillAndSubmit(ap, link)
    await ap.getByRole('heading', { name: /Дякуємо/ }).waitFor({ timeout: 20000 })
  })

  await h.check('public form: reused link shows generic invalid message', async () => {
    await ap.goto('about:blank')
    await ap.goto(link)
    await ap.reload()
    await ap.getByRole('heading', { name: 'Посилання не працює' }).waitFor()
  })

  await h.check('public form: garbage token shows the same generic message', async () => {
    await ap.goto(h.url('/form/' + 'x'.repeat(43)))
    await ap.reload()
    await ap.getByRole('heading', { name: 'Посилання не працює' }).waitFor()
    const t1 = await ap.locator('main').innerText()
    await ap.goto(link); await ap.reload()
    await ap.getByRole('heading', { name: 'Посилання не працює' }).waitFor()
    if (t1 !== (await ap.locator('main').innerText())) throw new Error('messages differ')
  })

  // --- approvals
  await h.check('approvals: badge shows count, diff visible', async () => {
    await page.goto(h.url('/updates'))
    await page.reload() // значок оновлюється раз на 60 с або після дій у цій вкладці
    await page.getByRole('heading', { name: /ТЕСТ_Перший/ }).waitFor()
    const badge = await page.locator('nav a', { hasText: 'Оновлення даних' }).locator('.badge').innerText()
    if (!/^1/.test(badge)) throw new Error('badge=' + badge)
    await page.getByText('ТЕСТ_Мама').first().waitFor()
  })

  await h.check('approvals: approve → card shows approved v1', async () => {
    await page.getByRole('button', { name: 'Підтвердити' }).click()
    await page.getByText('Немає версій, що чекають підтвердження.').waitFor()
    await page.goto(card1)
    await page.getByText(/версія 1, затверджена/).waitFor()
    await page.getByText('ТЕСТ_Мама').first().waitFor()
    await page.getByText('чинна').first().waitFor()
  })

  await h.check('approvals: 2nd submission approved → v1 superseded', async () => {
    const l2 = await createLink(page, card1)
    await fillAndSubmit(ap, l2, { address: 'ТЕСТ вул. Нова 2' })
    await ap.getByRole('heading', { name: /Дякуємо/ }).waitFor({ timeout: 20000 })
    await page.goto(h.url('/updates'))
    await page.getByText('ТЕСТ вул. Нова 2').first().waitFor()
    await page.getByRole('button', { name: 'Підтвердити' }).click()
    await page.getByText('Немає версій, що чекають підтвердження.').waitFor()
    await page.goto(card1)
    await page.getByText('застаріла').waitFor()
    await page.getByText(/версія 2, затверджена/).waitFor()
  })

  await h.check('approvals: reject flow → v3 rejected, current stays v2', async () => {
    const l3 = await createLink(page, card1)
    await fillAndSubmit(ap, l3, { address: 'ТЕСТ вул. Відхилена 3' })
    await ap.getByRole('heading', { name: /Дякуємо/ }).waitFor({ timeout: 20000 })
    await page.goto(h.url('/updates'))
    await page.getByText('ТЕСТ вул. Відхилена 3').first().waitFor()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Відхилити' }).click()
    await page.getByText('Немає версій, що чекають підтвердження.').waitFor()
    await page.goto(card1)
    await page.getByText('відхилена').waitFor()
    await page.getByText(/версія 2, затверджена/).waitFor()
  })

  await browser.close()
  fs.writeFileSync(process.env.IDS_OUT || '/dev/null', JSON.stringify(ids))
  h.summary()
})()

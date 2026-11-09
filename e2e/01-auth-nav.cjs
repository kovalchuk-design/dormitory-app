const h = require('./helpers.cjs')
;(async () => {
  const browser = await h.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  h.watch(page, 'auth')

  await h.check('wrong password shows message', async () => {
    await page.goto(h.url('/login'))
    await page.getByLabel('Email').fill(h.creds('ADMIN').email)
    await page.getByLabel('Пароль').fill('definitely-wrong')
    await page.getByRole('button', { name: 'Увійти' }).click()
    await page.getByText('Невірний email або пароль').waitFor({ timeout: 10000 })
  })

  await h.check('inactive user sees "Доступ відсутній"', async () => {
    const c = h.creds('INACTIVE')
    await page.getByLabel('Email').fill(c.email)
    await page.getByLabel('Пароль').fill(c.password)
    await page.getByRole('button', { name: 'Увійти' }).click()
    await page.getByRole('heading', { name: 'Доступ відсутній' }).waitFor({ timeout: 10000 })
    await page.getByRole('button', { name: 'Вийти' }).click()
    await page.getByRole('heading', { name: 'Вхід' }).waitFor()
  })

  const navOf = async (role) => {
    await ctx.clearCookies()
    await page.goto(h.url('/login'))
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await h.login(page, role)
    const labels = await page.locator('nav[aria-label="Головна навігація"] a').allInnerTexts()
    return labels.map((s) => s.replace(/\d+\s*очікують.*/s, '').trim())
  }

  await h.check('admin: login, nav has Адміністрування + Оновлення даних; logout', async () => {
    const nav = await navOf('ADMIN')
    if (!nav.includes('Адміністрування')) throw new Error('no admin link: ' + nav)
    if (!nav.some((n) => n.startsWith('Оновлення даних'))) throw new Error('no updates link')
    // session persists on reload
    await page.reload()
    await page.getByRole('button', { name: 'Вийти' }).waitFor()
    await page.getByRole('button', { name: 'Вийти' }).click()
    await page.getByRole('heading', { name: 'Вхід' }).waitFor()
  })

  await h.check('educator: no Адміністрування, has Оновлення даних', async () => {
    const nav = await navOf('EDUCATOR')
    if (nav.includes('Адміністрування')) throw new Error('educator sees admin')
    if (!nav.some((n) => n.startsWith('Оновлення даних'))) throw new Error('no updates link')
    await page.goto(h.url('/admin'))
    await page.waitForTimeout(800)
    if (await page.getByText('Адміністрування').count() && (await page.locator('main h1').allInnerTexts()).join().includes('Адміністрування')) throw new Error('educator reached /admin')
    await page.getByRole('button', { name: 'Вийти' }).click()
  })

  await h.check('staff_readonly: no Адміністрування, no Оновлення даних', async () => {
    const nav = await navOf('READONLY')
    if (nav.includes('Адміністрування') || nav.some((n) => n.startsWith('Оновлення'))) throw new Error('nav: ' + nav)
    await page.goto(h.url('/updates'))
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Вийти' }).click()
  })

  await h.check('mobile 390x844: burger opens nav, navigation works', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await m.newPage()
    h.watch(p, 'mobile')
    await h.login(p, 'ADMIN')
    const nav = p.locator('nav[aria-label="Головна навігація"]')
    await p.getByRole('button', { name: 'Меню' }).click()
    await nav.getByRole('link', { name: 'Кімнати' }).click()
    await p.waitForURL(/#\/rooms/)
    const sw = await p.evaluate(() => document.documentElement.scrollWidth)
    if (sw > 392) throw new Error('horizontal overflow ' + sw)
    await m.close()
  })

  await h.check('all pages load for admin without error banner', async () => {
    await navOf('ADMIN')
    for (const r of ['/', '/students', '/updates', '/rooms', '/documents', '/events', '/calendar', '/admin']) {
      await page.goto(h.url(r))
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      const errs = await page.locator('.error, [role=alert]').allInnerTexts()
      if (errs.length) throw new Error(`${r}: ${errs.join(' | ').slice(0, 200)}`)
    }
  })

  await browser.close()
  h.summary()
})()

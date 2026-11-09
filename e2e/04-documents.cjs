// Сценарій 6: документи — завантаження, перегляд, «створити на основі», автозаповнення шаблону, права.
// ВАЖЛИВО: змінює налаштування educators_can_edit_templates; наприкінці повертає у false.
const fs = require('fs'), os = require('os'), path = require('path')
const PizZip = require('pizzip')
const h = require('./helpers.cjs')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-docs-'))
function docx(text) {
  const z = new PizZip()
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body></w:document>`)
  return z.generate({ type: 'nodebuffer' })
}
const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
const F = {
  docx: path.join(tmp, 'test-doc.docx'), pdf: path.join(tmp, 'test-doc.pdf'), tpl: path.join(tmp, 'test-template.docx'),
}
fs.writeFileSync(F.docx, docx('ТЕСТ вміст документа для перегляду'))
fs.writeFileSync(F.pdf, pdf())
fs.writeFileSync(F.tpl, docx('Заява: {{student.full_name}}, клас {{student.grade}}, кімната {{student.room}}, вихователь {{educator.full_name}}, к-сть {{count}}'))

const tab = (p, n) => p.getByRole('tab', { name: n }).click()
async function upload(p, file, title) {
  await p.getByRole('button', { name: /Завантажити документ/ }).click()
  await p.locator('.upload-form input[type=file]').setInputFiles(file)
  await p.locator('.upload-form label', { hasText: /^Назва/ }).locator('input').fill(title)
  await p.locator('.upload-form label', { hasText: /^Категорія/ }).locator('input').fill('ТЕСТ_кат')
  await p.locator('.upload-form label', { hasText: /^Тема/ }).locator('input').fill('ТЕСТ_тема')
  await p.locator('.upload-form button[type=submit]').click()
  await p.getByText(`Документ «${title}» завантажено.`).waitFor()
}
const card = (p, t) => p.locator('li.doc-card').filter({ has: p.locator(`h3:text-is("${t}")`) })

;(async () => {
  const browser = await h.launch()
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 900 } })
  const A = await ctx.newPage(); h.watch(A, 'admin')
  await h.login(A, 'ADMIN')
  await A.goto(h.url('/documents'))
  await A.getByRole('heading', { name: 'Документи' }).waitFor()

  A.on('dialog', (d) => d.accept().catch(() => {}))
  const wipe = async () => { // видаляє тестові документи через UI (SQL не може чіпати storage)
    await A.goto(h.url('/documents'))
    await A.getByText(/Знайдено:/).waitFor()
    for (let i = 0; i < 20 && (await A.locator('li.doc-card', { hasText: 'ТЕСТ_' }).count()); i++) {
      const n = await A.locator('li.doc-card', { hasText: 'ТЕСТ_' }).count()
      await A.locator('li.doc-card', { hasText: 'ТЕСТ_' }).first().getByRole('button', { name: 'Видалити' }).click()
      await A.waitForFunction((k) => document.querySelectorAll('li.doc-card').length < k || !document.querySelector('li.doc-card'), n, { timeout: 8000 }).catch(() => {})
      await A.waitForTimeout(400)
    }
    await A.getByRole('tab', { name: 'Шаблони й автозаповнення' }).click()
    await A.getByText('1. Оберіть шаблон').waitFor()
    for (let i = 0; i < 10 && (await A.locator('li.doc-card', { hasText: 'ТЕСТ_' }).count()); i++) {
      await A.locator('li.doc-card', { hasText: 'ТЕСТ_' }).first().getByRole('button', { name: 'Видалити' }).click()
      await A.waitForTimeout(1200)
    }
    await A.getByRole('tab', { name: 'Архів' }).click()
  }
  await wipe()

  await h.check('documents: page loads w/o error', async () => {
    await A.getByText(/Знайдено:/).waitFor()
    if (await A.locator('p.error').count()) throw new Error(await A.locator('p.error').first().innerText())
  })
  await h.check('documents: upload .docx and .pdf', async () => {
    await upload(A, F.docx, 'ТЕСТ_док_docx')
    await upload(A, F.pdf, 'ТЕСТ_док_pdf')
    await card(A, 'ТЕСТ_док_pdf').waitFor()
  })
  await h.check('documents: .docx preview renders text', async () => {
    await card(A, 'ТЕСТ_док_docx').getByRole('button', { name: 'Перегляд' }).click()
    await A.locator('.preview-pane').getByText('ТЕСТ вміст документа для перегляду').waitFor()
    await A.keyboard.press('Escape')
    if (await A.locator('.preview-pane').count()) await A.getByRole('button', { name: /Закрити|×/ }).first().click()
  })
  await h.check('documents: .pdf preview opens (signed URL loads)', async () => {
    const resp = A.waitForResponse((r) => r.url().includes('/sign/'), { timeout: 12000 })
    resp.catch(() => {})
    await card(A, 'ТЕСТ_док_pdf').getByRole('button', { name: 'Перегляд' }).click()
    await A.locator('iframe.pdf-frame').waitFor()
    const r = await resp
    if (r.status() >= 400) throw new Error('sign status ' + r.status())
    await A.keyboard.press('Escape')
    if (await A.locator('.preview-pane').count()) await A.getByRole('button', { name: /Закрити|×/ }).first().click()
  })
  await h.check('documents: download works', async () => {
    const [dl] = await Promise.all([A.waitForEvent('download'), card(A, 'ТЕСТ_док_docx').getByRole('button', { name: 'Завантажити', exact: true }).click()])
    if (fs.statSync(await dl.path()).size < 100) throw new Error('empty download')
  })
  await h.check('documents: «Створити на основі…» preview → create copy → lineage shown', async () => {
    await card(A, 'ТЕСТ_док_docx').getByRole('button', { name: 'Створити на основі цього' }).click()
    await A.locator('.preview-pane').getByText('ТЕСТ вміст документа для перегляду').waitFor()
    await A.getByRole('button', { name: 'Створити на основі цього' }).click()
    await A.getByLabel('Назва нового документа').fill('ТЕСТ_копія')
    await A.getByRole('button', { name: 'Створити копію' }).click()
    await A.getByRole('heading', { name: 'Документ створено' }).waitFor()
    await tab(A, 'Архів')
    await card(A, 'ТЕСТ_копія').getByText(/Створено на основі:/).waitFor()
  })

  await h.check('templates: admin uploads template; autofill produces substituted .docx', async () => {
    await tab(A, 'Шаблони й автозаповнення')
    await A.locator('form.panel input[type=file]').setInputFiles(F.tpl)
    await A.getByLabel('Назва', { exact: true }).fill('ТЕСТ_шаблон')
    await A.getByRole('button', { name: 'Додати шаблон' }).click()
    await A.getByText('Шаблон додано.').waitFor()
    await card(A, 'ТЕСТ_шаблон').getByRole('button', { name: 'Використати' }).click()
    await A.locator('.pupil-list label', { hasText: 'ТЕСТ_Перший' }).locator('input').check()
    await A.getByRole('button', { name: '3. Сформувати документ' }).click()
    const [dl] = await Promise.all([A.waitForEvent('download'), A.getByRole('button', { name: /^Завантажити .*ТЕСТ_шаблон/ }).click()])
    const xml = new PizZip(fs.readFileSync(await dl.path())).file('word/document.xml').asText()
    const text = xml.replace(/<[^>]+>/g, '')
    console.log('   result text:', text)
    if (!text.includes('ТЕСТ_Перший Учень') || !text.includes('клас 10') || !text.includes('ТЕСТ_адмін') || text.includes('{{')) throw new Error('bad substitution: ' + text)
  })

  const eduCheck = async (label, expectEditable) => {
    const c = await browser.newContext({ viewport: { width: 1300, height: 900 } })
    const E = await c.newPage(); h.watch(E, 'educator')
    await h.login(E, 'EDUCATOR')
    await E.goto(h.url('/documents'))
    await tab(E, 'Шаблони й автозаповнення')
    await card(E, 'ТЕСТ_шаблон').waitFor()
    const hasUpload = await E.getByRole('button', { name: 'Додати шаблон' }).count()
    if (!!hasUpload !== expectEditable) throw new Error(`${label}: upload form visible=${!!hasUpload}, expected ${expectEditable}`)
    await c.close()
  }
  await h.check('templates: educator cannot edit templates when toggle OFF', () => eduCheck('off', false))
  await h.check('templates: admin toggles educators_can_edit_templates ON → educator can', async () => {
    await A.goto(h.url('/admin'))
    const sw = A.getByRole('switch')
    await A.waitForTimeout(2000)
    await A.waitForFunction(() => !document.querySelector('[role=switch]')?.disabled)
    if (await sw.isChecked()) { await sw.click(); await A.waitForTimeout(1200) } // починаємо з OFF
    await sw.click()
    await A.waitForTimeout(1200)
    if (!(await sw.isChecked())) throw new Error('toggle did not turn on; ' + (await A.locator('.error').allInnerTexts()).join('|'))
    await eduCheck('on', true)
    await sw.click()
    await A.waitForTimeout(1200)
    if (await sw.isChecked()) throw new Error('toggle not restored')
  })

  await h.check('documents: educator can upload but cannot delete admin\'s doc; readonly cannot upload', async () => {
    const c = await browser.newContext({ viewport: { width: 1300, height: 900 } })
    const E = await c.newPage(); h.watch(E, 'educator')
    await h.login(E, 'EDUCATOR'); await E.goto(h.url('/documents'))
    await E.getByRole('button', { name: /Завантажити документ/ }).waitFor()
    if (await card(E, 'ТЕСТ_док_docx').getByRole('button', { name: 'Видалити' }).count()) throw new Error('educator can delete others doc')
    await c.close()
    const c2 = await browser.newContext({ viewport: { width: 1300, height: 900 } })
    const R = await c2.newPage(); h.watch(R, 'readonly')
    await h.login(R, 'READONLY'); await R.goto(h.url('/documents'))
    await card(R, 'ТЕСТ_док_docx').waitFor()
    if (await R.getByRole('button', { name: /Завантажити документ/ }).count()) throw new Error('readonly sees upload')
    if (await card(R, 'ТЕСТ_док_docx').getByRole('button', { name: 'Створити на основі цього' }).count()) throw new Error('readonly sees based-on')
    await tab(R, 'Створити на основі…')
    await R.getByText('Створювати документи можуть лише').waitFor()
    await c2.close()
  })

  await h.check('documents: admin can delete docs and template via UI (cleanup)', async () => {
    await wipe()
    if (await A.locator('li.doc-card', { hasText: 'ТЕСТ_' }).count()) throw new Error('docs remain')
  })

  await browser.close()
  h.summary()
})()

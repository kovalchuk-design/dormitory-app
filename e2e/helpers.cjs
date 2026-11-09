// Спільні утиліти E2E. Параметри — через змінні середовища (секрети НЕ комітимо).
const { chromium } = require('playwright')

const BASE_URL = (process.env.BASE_URL || 'https://kovalchuk-design.github.io/dormitory-app/').replace(/\/?$/, '/')
const creds = (role) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
})

const results = []
function record(name, ok, note = '') {
  results.push({ name, ok, note })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' — ' + note : ''}`)
}
async function check(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (e) {
    record(name, false, String(e.message || e).split('\n')[0])
  }
}

const issues = []
/** Збирає console.error та 4xx/5xx відповіді (крім навмисних). */
function watch(page, tag) {
  page.setDefaultTimeout(12000)
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`[${tag}] console: ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', (e) => issues.push(`[${tag}] pageerror: ${String(e).slice(0, 200)}`))
  page.on('response', (r) => {
    if (r.status() >= 400) issues.push(`[${tag}] ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '').slice(0, 160)}`)
  })
}

async function launch() {
  return chromium.launch({ args: ['--no-sandbox'] })
}
const url = (hash) => `${BASE_URL}#${hash}`

async function login(page, role) {
  const { email, password } = creds(role)
  await page.goto(url('/login'))
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Увійти' }).click()
  await page.getByRole('button', { name: 'Вийти' }).waitFor({ timeout: 15000 })
}

function summary() {
  console.log('\n--- issues (console/network) ---')
  const uniq = [...new Set(issues)]
  uniq.forEach((i) => console.log(i))
  if (!uniq.length) console.log('(none)')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  process.exitCode = failed ? 1 : 0
}

module.exports = { BASE_URL, creds, check, record, watch, launch, url, login, summary, issues, results }

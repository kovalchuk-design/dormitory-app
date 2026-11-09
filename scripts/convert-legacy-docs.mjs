#!/usr/bin/env node
/**
 * Конвертує старі формати (.doc, .rtf, .odt, .docm) у .docx перед імпортом/завантаженням в архів.
 * .docx і .pdf копіюються без змін. Потрібен LibreOffice (команда `soffice`).
 *
 * Використання:
 *   node scripts/convert-legacy-docs.mjs <папка-з-файлами> <папка-результату>
 *
 * Потім імпортуйте файли з <папка-результату>. Невдалі файли виводяться в кінці й
 * повертають ненульовий код виходу — їх варто відкрити вручну та перезберегти як .docx.
 * Не комітьте реальні документи в репозиторій.
 */
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const LEGACY = new Set(['.doc', '.rtf', '.odt', '.docm'])
const PASS_THROUGH = new Set(['.docx', '.pdf'])

/** 'convert' | 'copy' | 'skip' — що робити з файлом за його іменем. */
export function planFor(fileName) {
  const ext = extname(fileName).toLowerCase()
  if (fileName.startsWith('~$') || fileName.startsWith('.')) return 'skip' // тимчасові файли Word
  if (LEGACY.has(ext)) return 'convert'
  if (PASS_THROUGH.has(ext)) return 'copy'
  return 'skip'
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

async function convert(file, outDir) {
  // окремий профіль LibreOffice, щоб не конфліктувати з відкритим екземпляром
  const profile = `-env:UserInstallation=file://${join(outDir, '.lo-profile')}`
  await run('soffice', [profile, '--headless', '--convert-to', 'docx:MS Word 2007 XML', '--outdir', outDir, file], {
    timeout: 120_000,
  })
  const produced = join(outDir, basename(file, extname(file)) + '.docx')
  await stat(produced) // кине помилку, якщо файл не створено
  return produced
}

async function main() {
  const [inDir, outDirArg] = process.argv.slice(2)
  if (!inDir || !outDirArg) {
    console.error('Використання: node scripts/convert-legacy-docs.mjs <вхідна-папка> <папка-результату>')
    process.exit(2)
  }
  const outDir = resolve(outDirArg)
  await mkdir(outDir, { recursive: true })
  const stats = { converted: 0, copied: 0, skipped: 0 }
  const failed = []
  for await (const file of walk(resolve(inDir))) {
    const plan = planFor(basename(file))
    try {
      if (plan === 'copy') {
        await copyFile(file, join(outDir, basename(file)))
        stats.copied++
      } else if (plan === 'convert') {
        // одноіменні файли з різних папок не мають перезаписувати один одного
        const tmpDir = join(outDir, '.tmp-' + process.pid)
        await mkdir(tmpDir, { recursive: true })
        const produced = await convert(file, tmpDir)
        let target = join(outDir, basename(produced))
        for (let i = 2; await stat(target).then(() => true, () => false); i++) {
          target = join(outDir, `${basename(produced, '.docx')} (${i}).docx`)
        }
        await rename(produced, target)
        stats.converted++
        console.log(`✔ ${basename(file)} → ${basename(target)}`)
      } else {
        stats.skipped++
      }
    } catch (e) {
      failed.push(`${file}: ${e.message.split('\n')[0]}`)
    }
  }
  await rm(join(outDir, '.tmp-' + process.pid), { recursive: true, force: true })
  await rm(join(outDir, '.lo-profile'), { recursive: true, force: true })
  console.log(`\nКонвертовано: ${stats.converted}, скопійовано (.docx/.pdf): ${stats.copied}, пропущено: ${stats.skipped}, помилок: ${failed.length}`)
  if (failed.length) {
    console.error('\nНе вдалося конвертувати:\n' + failed.join('\n'))
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()

#!/usr/bin/env node
/**
 * Робить шаблон «Список учнів по поверху» з реального заповненого .docx:
 * лишає розмітку (альбомна сторінка, ширини колонок, шрифти, заголовок таблиці, що повторюється),
 * а всі рядки учнів замінює ОДНИМ рядком із мітками {{…}}.
 * Реальні дані учнів у вихідний шаблон не потрапляють.
 *
 *   node scripts/make-floor-template.mjs <заповнений.docx> <шаблон.docx>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import PizZip from 'pizzip'

const [, , input, output] = process.argv
if (!input || !output) {
  console.error('Використання: node scripts/make-floor-template.mjs <заповнений.docx> <шаблон.docx>')
  process.exit(1)
}

// Текст кожної клітинки зразкового рядка: масив абзаців. Перша і остання клітинки відкривають/закривають цикл.
const CELLS = [
  ['{{#students}}{{index}}'],
  ['{{full_name}}'],
  ['{{birth_date}}'],
  ['{{room}}'],
  ['{{group_profession}}'],
  ['{{curators}}'],
  ['{{address}}', '{{phone_line}}'],
  ['{{parents}}'],
  ['{{social_status}}{{/students}}'],
]

const zip = new PizZip(readFileSync(input))
let xml = zip.file('word/document.xml').asText()
const tblStart = xml.indexOf('<w:tbl>')
const tblEnd = xml.indexOf('</w:tbl>')
if (tblStart < 0) throw new Error('У файлі немає таблиці')
const table = xml.slice(tblStart, tblEnd)
const rows = table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []
if (rows.length < 2) throw new Error('Очікується заголовок і хоча б один рядок учня')
const sample = rows[1]
const cells = sample.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []
if (cells.length !== CELLS.length) throw new Error(`Очікувалось ${CELLS.length} колонок, у файлі ${cells.length}`)

// Ширини колонок (twips, разом 15876 — як у зразку): вузькі «№ з/п», «№ кім» і «Дата народження», решта простору — ПІП та батькам.
const WIDTHS = [567, 2276, 1400, 567, 2693, 1843, 2409, 2562, 1559]
// Колонки, де дані завжди короткі й числові — вирівнюємо по центру: № з/п, дата народження, № кім.
const CENTER = new Set([0, 2, 3])
// Заголовки, які розбиваємо на кілька рядків (як у сусідніх колонок).
const HEADER_LINES = { 2: ['Дата', 'народження'], 5: ['Куратор групи,', 'майстер групи'] }

const setWidth = (cell, w) => cell.replace(/<w:tcW w:w="\d+"/, `<w:tcW w:w="${w}"`)

const headerCells = rows[0].match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []
if (headerCells.length !== WIDTHS.length) throw new Error('Заголовок має інше число колонок')
let newHead = rows[0]
headerCells.forEach((hc, i) => {
  let nc = setWidth(hc, WIDTHS[i])
  // Вертикальне центрування заголовків: однорядкові («ПІП учня», «Примітка») стоять на одному рівні з дворядковими.
  if (!nc.includes('<w:vAlign')) nc = nc.includes('<w:hideMark/>') ? nc.replace('<w:hideMark/>', '<w:vAlign w:val="center"/><w:hideMark/>') : nc.replace('</w:tcPr>', '<w:vAlign w:val="center"/></w:tcPr>')
  const lines = HEADER_LINES[i]
  if (lines) {
    const para = /<w:p[ >][\s\S]*?<\/w:p>/.exec(hc)[0]
    const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(para)?.[0] ?? ''
    const rPr = /<w:r[ >][\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(para)?.[1] ?? ''
    const paras = lines.map((t) => `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('')
    nc = nc.replace(/<w:p[ >][\s\S]*<\/w:p>/, paras)
  }
  newHead = newHead.replace(hc, nc)
})

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const newCells = cells.map((cell, i) => {
  const tcPr = setWidth(/<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(cell)?.[0] ?? '', WIDTHS[i])
  const firstP = /<w:p[ >][\s\S]*?<\/w:p>/.exec(cell)?.[0] ?? ''
  let pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(firstP)?.[0] ?? '<w:pPr></w:pPr>'
  pPr = pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '').replace(/<w:pStyle [^>]*\/>/, '')
  if (CENTER.has(i) && !pPr.includes('<w:jc ')) {
    pPr = pPr.includes('<w:rPr>') ? pPr.replace('<w:rPr>', '<w:jc w:val="center"/><w:rPr>') : pPr.replace('</w:pPr>', '<w:jc w:val="center"/></w:pPr>')
  }
  const rPr = /<w:r[ >][\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(firstP)?.[1] ?? ''
  const paras = CELLS[i]
    .map((t) => `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`)
    .join('')
  return `<w:tc>${tcPr}${paras}</w:tc>`
})
const trOpen = /^<w:tr[^>]*>/.exec(sample)[0]
const trPr = /<w:trPr>[\s\S]*?<\/w:trPr>/.exec(sample)?.[0] ?? ''
const newRow = `${trOpen}${trPr}${newCells.join('')}</w:tr>`

const newTable = rows.reduce((acc, r, idx) => (idx === 0 ? acc.replace(r, newHead) : idx === 1 ? acc.replace(r, newRow) : acc.replace(r, '')), table)
let fixedTable = newTable
const grid = /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/.exec(fixedTable)?.[0]
if (grid) fixedTable = fixedTable.replace(grid, `<w:tblGrid>${WIDTHS.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`)
xml = xml.slice(0, tblStart) + fixedTable + xml.slice(tblEnd)
zip.file('word/document.xml', xml)
writeFileSync(output, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`Шаблон записано: ${output} (видалено рядків учнів: ${rows.length - 2})`)

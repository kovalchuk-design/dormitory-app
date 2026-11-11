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

// Заголовок колонки «Куратор групи» → два рядки: «Куратор групи,» / «майстер групи» (як у сусідніх колонок з двома рядками).
const headerCells = rows[0].match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []
const curatorHead = headerCells[5]
let newHead = rows[0]
if (curatorHead && curatorHead.includes('Куратор групи')) {
  const para = /<w:p[ >][\s\S]*?<\/w:p>/.exec(curatorHead)[0]
  const first = para.replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/, '$1Куратор групи,$2')
  const second = para.replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/, '$1майстер групи$2')
  newHead = rows[0].replace(curatorHead, curatorHead.replace(para, first + second))
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const newCells = cells.map((cell, i) => {
  const tcPr = /<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(cell)?.[0] ?? ''
  const firstP = /<w:p[ >][\s\S]*?<\/w:p>/.exec(cell)?.[0] ?? ''
  let pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(firstP)?.[0] ?? '<w:pPr></w:pPr>'
  pPr = pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '').replace(/<w:pStyle [^>]*\/>/, '')
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
xml = xml.slice(0, tblStart) + newTable + xml.slice(tblEnd)
zip.file('word/document.xml', xml)
writeFileSync(output, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`Шаблон записано: ${output} (видалено рядків учнів: ${rows.length - 2})`)

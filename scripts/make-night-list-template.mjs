#!/usr/bin/env node
/**
 * Створює шаблон «Список учнів, які залишаються на ніч» (тиждень, A4 книжкова, 2 колонки):
 * заголовок → кімнати таблицями (кімната не розривається) у 2 колонки → знизу блок «Чергові на кухні».
 * Реальних даних немає, лише мітки {{…}}.
 *
 *   node scripts/make-night-list-template.mjs <шаблон.docx>
 */
import { writeFileSync } from 'node:fs'
import PizZip from 'pizzip'

const out = process.argv[2]
if (!out) {
  console.error('Використання: node scripts/make-night-list-template.mjs <шаблон.docx>')
  process.exit(1)
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const FONT = 'Times New Roman'
const GRAY = 'E3E3E3'
const PAGE = { w: 11906, h: 16838, top: 454, bottom: 454, left: 567, right: 567 }
const TEXT_W = PAGE.w - PAGE.left - PAGE.right // 10772
const GAP = 284
const COL_W = Math.floor((TEXT_W - GAP) / 2) // 5244
const DAY_W = 405
const NAME_W = COL_W - DAY_W * 7 // 2409
const ROW_H = 230 // мінімальна висота рядка кімнати (twips)

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function p(text, { sz = 16, bold = false, jc, keepNext = false, before = 0, after = 0, border = false, line } = {}) {
  const ppr =
    (keepNext ? '<w:keepNext/>' : '') +
    (border ? '<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="808080"/></w:pBdr>' : '') +
    `<w:spacing w:before="${before}" w:after="${after}"${line ? ` w:line="${line}" w:lineRule="exact"` : ''}/>` +
    (jc ? `<w:jc w:val="${jc}"/>` : '') +
    `<w:rPr><w:sz w:val="${sz}"/></w:rPr>`
  const run = text ? `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : ''
  return `<w:p><w:pPr>${ppr}</w:pPr>${run}</w:p>`
}

function tc(width, paragraphs, { shd, vAlign = 'center' } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : ''}<w:vAlign w:val="${vAlign}"/></w:tcPr>${paragraphs}</w:tc>`
}

const tr = (cells, { height, exact = false } = {}) =>
  `<w:tr><w:trPr><w:cantSplit/>${height ? `<w:trHeight w:val="${height}"${exact ? ' w:hRule="exact"' : ''}/>` : ''}</w:trPr>${cells}</w:tr>`

const tblPr = (width) =>
  `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('') +
  `</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr>`

// ---- таблиця кімнати: заголовок (№ кімнати + дні) / рядки учнів / сірий підсумковий рядок
const grid = `<w:tblGrid><w:gridCol w:w="${NAME_W}"/>${DAYS.map(() => `<w:gridCol w:w="${DAY_W}"/>`).join('')}</w:tblGrid>`
const headRow = tr(
  tc(NAME_W, p('Кімната {{room}}', { bold: true, keepNext: true })) +
    DAYS.map((d) => tc(DAY_W, p(d, { bold: true, jc: 'center', keepNext: true }))).join(''),
  { height: ROW_H },
)
const studentRow = tr(
  tc(NAME_W, p('{{#students}}{{short_name}}', { keepNext: true })) +
    DAYS.map((_, i) => tc(DAY_W, p(i === 6 ? '{{/students}}' : '', { keepNext: true }))).join(''),
  { height: ROW_H },
)
const totalRow = tr(
  tc(NAME_W, p('Разом', { bold: true }), { shd: GRAY }) + DAYS.map(() => tc(DAY_W, p(''), { shd: GRAY })).join(''),
  { height: ROW_H },
)
const roomTable = `<w:tbl>${tblPr(COL_W)}${grid}${headRow}${studentRow}${totalRow}</w:tbl>`
const spacer = p('', { sz: 6, line: 70 })

// ---- блок «Чергові на кухні» на всю ширину
const KDAY_W = Math.floor(TEXT_W / 7)
const kitchenGrid = `<w:tblGrid>${DAYS.map(() => `<w:gridCol w:w="${KDAY_W}"/>`).join('')}</w:tblGrid>`
const kitchenHead = tr(DAYS.map((d) => tc(KDAY_W, p(d, { bold: true, jc: 'center', sz: 14 }), { shd: GRAY })).join(''), { height: 220 })
const kitchenRow = tr(DAYS.map(() => tc(KDAY_W, p('', { sz: 14 }))).join(''), { height: 330 })
const kitchenTable = `<w:tbl>${tblPr(KDAY_W * 7)}${kitchenGrid}${kitchenHead}${kitchenRow}${kitchenRow}${kitchenRow}</w:tbl>`

const sect = (cols, type) =>
  `<w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}<w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>` +
  `<w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="227" w:footer="227" w:gutter="0"/>` +
  (cols === 2 ? `<w:cols w:num="2" w:space="${GAP}"/>` : '<w:cols w:space="708"/>') +
  `</w:sectPr>`
const sectPara = (cols, type) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${sect(cols, type)}</w:pPr></w:p>`

const body =
  p('СПИСОК учнів, які залишаються в гуртожитку на ніч', { sz: 24, bold: true, jc: 'center', after: 20 }) +
  p('{{floor}} поверх  ·  навчальний рік {{year}}  ·  тиждень з ____________ по ____________ 20___ р.', { sz: 18, jc: 'center', after: 60 }) +
  sectPara(1) +
  p('{{#rooms}}', { sz: 2, line: 20 }) +
  roomTable +
  spacer +
  p('{{/rooms}}', { sz: 2, line: 20 }) +
  sectPara(2, 'continuous') +
  p('Чергові на кухні (записує вихователь від руки: ПІБ чергових учнів на кожну добу)', { sz: 14, bold: true, before: 60, after: 30, border: true, keepNext: true }) +
  kitchenTable +
  p('', { sz: 2, line: 20 }) +
  sect(1, 'continuous')

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const zip = new PizZip()
zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:lang w:val="uk-UA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`)
zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`)
writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`Шаблон записано: ${out}`)

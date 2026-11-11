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
// Правила таблиць (vAlign = center у кожній клітинці) описані в scripts/lib/docx-cell.mjs

const out = process.argv[2]
if (!out) {
  console.error('Використання: node scripts/make-night-list-template.mjs <шаблон.docx>')
  process.exit(1)
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const DAYS_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя']
const FONT = 'Times New Roman'
const GRAY = 'E3E3E3'
const PAGE = { w: 11906, h: 16838, top: 454, bottom: 454, left: 567, right: 567 }
const TEXT_W = PAGE.w - PAGE.left - PAGE.right // 10772
const GAP = 284
const COL_W = Math.floor((TEXT_W - GAP) / 2) // 5244
const DAY_W = 405
const NAME_W = COL_W - DAY_W * 7 // 2409
const KITCHEN_ROW_H = 255 // висота рядка для запису від руки
const ROW_H = 210 // мінімальна висота рядка кімнати (twips)

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function p(text, { sz = 16, bold = false, jc, keepNext = false, pageBreakBefore = false, before = 0, after = 0, border = false, line } = {}) {
  const ppr =
    (keepNext ? '<w:keepNext/>' : '') +
    (pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
    (border ? '<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="808080"/></w:pBdr>' : '') +
    '<w:suppressAutoHyphens/>' +
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
  tc(NAME_W, p('{{#students}}{{last_first}}', { keepNext: true })) +
    DAYS.map((_, i) => tc(DAY_W, p(i === 6 ? '{{/students}}' : '', { keepNext: true }))).join(''),
  { height: ROW_H },
)
const totalRow = tr(
  tc(NAME_W, p(''), { shd: GRAY }) + DAYS.map(() => tc(DAY_W, p(''), { shd: GRAY })).join(''),
  { height: ROW_H },
)
const roomTable = `<w:tbl>${tblPr(COL_W)}${grid}${headRow}${studentRow}${totalRow}</w:tbl>`
const spacer = p('', { sz: 6, line: 70 })
// Колонка сторінки: цикл по кімнатах (таблиця + проміжок). Кімната — окрема вкладена таблиця, тому не розривається.
// Підсумок колонки: рядок «Разом» з клітинками на кожен день — вихователь вписує суму по кімнатах колонки.
const SUM_GRAY = 'CFCFCF'
const columnSumRow = tr(
  tc(NAME_W, p('Разом по колонці', { bold: true }), { shd: SUM_GRAY }) + DAYS.map(() => tc(DAY_W, p(''), { shd: SUM_GRAY })).join(''),
  { height: ROW_H },
)
const columnSumTable = `<w:tbl>${tblPr(COL_W)}${grid}${columnSumRow}</w:tbl>`
const loop = (name) => p(`{{#${name}}}`, { sz: 2, line: 20 }) + roomTable + spacer + p(`{{/${name}}}`, { sz: 2, line: 20 }) + columnSumTable + p('', { sz: 2, line: 20 })
const noBorders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((x) => `<w:${x} w:val="nil"/>`).join('')
const outerCell = (w, content) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`
const columnsTable =
  `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblBorders>${noBorders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
  `<w:tblGrid><w:gridCol w:w="${COL_W}"/><w:gridCol w:w="${GAP}"/><w:gridCol w:w="${COL_W}"/></w:tblGrid>` +
  `<w:tr>${outerCell(COL_W, loop('roomsLeft'))}${outerCell(GAP, p(''))}${outerCell(COL_W, loop('roomsRight'))}</w:tr></w:tbl>`

// ---- «Усього за добу»: сума обох колонок по кожному дню (записує вихователь)
const TOT_LABEL_W = 1900
const TOT_DAY_W = Math.floor((TEXT_W - TOT_LABEL_W) / 7)
const TOT_DAYNAME_W = 380
const totalGrid = `<w:tblGrid><w:gridCol w:w="${TOT_LABEL_W}"/>${DAYS.map(() => `<w:gridCol w:w="${TOT_DAYNAME_W}"/><w:gridCol w:w="${TOT_DAY_W - TOT_DAYNAME_W}"/>`).join('')}</w:tblGrid>`
const grandRow = tr(
  tc(TOT_LABEL_W, p('Усього за добу', { bold: true }), { shd: SUM_GRAY }) +
    DAYS.map((d) => tc(TOT_DAYNAME_W, p(d, { bold: true, jc: 'center' }), { shd: SUM_GRAY }) + tc(TOT_DAY_W - TOT_DAYNAME_W, p(''))).join(''),
  { height: 300 },
)
const totalTable = `<w:tbl>${tblPr(TEXT_W)}${totalGrid}${grandRow}</w:tbl>`

// ---- блок «Чергові на кухні» на всю ширину: дві однакові половини (за шириною — як колонки кімнат),
// у кожній «Кімн.» + «Прізвище, ім’я, по батькові» (довга колонка під почерк), по KITCHEN_ROWS рядків від руки.
const KITCHEN_ROWS = 8
const KROOM_W = 600
const KNAME_W = COL_W - KROOM_W
const kitchenGrid = `<w:tblGrid><w:gridCol w:w="${KROOM_W}"/><w:gridCol w:w="${KNAME_W}"/><w:gridCol w:w="${GAP}"/><w:gridCol w:w="${KROOM_W}"/><w:gridCol w:w="${KNAME_W}"/></w:tblGrid>`
const gapCell = `<w:tc><w:tcPr><w:tcW w:w="${GAP}" w:type="dxa"/><w:tcBorders>${['top', 'left', 'bottom', 'right'].map((x) => `<w:${x} w:val="nil"/>`).join('')}</w:tcBorders><w:vAlign w:val="center"/></w:tcPr>${p('', { sz: 14 })}</w:tc>`
const kHead = (text) => tc(KROOM_W, p('Кімн.', { sz: 14, bold: true, jc: 'center' }), { shd: GRAY }) + tc(KNAME_W, p(text, { sz: 14, bold: true, jc: 'center' }), { shd: GRAY })
const kCells = () => tc(KROOM_W, p('', { sz: 14 })) + tc(KNAME_W, p('', { sz: 14 }))
const kitchenHead = tr(kHead('Прізвище, ім’я, по батькові') + gapCell + kHead('Прізвище, ім’я, по батькові'), { height: 220 })
const kitchenRow = tr(kCells() + gapCell + kCells(), { height: KITCHEN_ROW_H })
const kitchenTable = `<w:tbl>${tblPr(TEXT_W)}${kitchenGrid}${kitchenHead}${Array.from({ length: KITCHEN_ROWS }, () => kitchenRow).join('')}</w:tbl>`

const sect = (cols, type) =>
  `<w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}<w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>` +
  `<w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="227" w:footer="227" w:gutter="0"/>` +
  (cols === 2 ? `<w:cols w:num="2" w:space="${GAP}"/>` : '<w:cols w:space="708"/>') +
  `</w:sectPr>`

const TITLE = 'СПИСОК учнів, які залишаються в гуртожитку на ніч — {{floor}} поверх'
// Один поверх = одна сторінка: усе, що нижче, повторюється по {{#floors}}; заголовок кожного поверху починається з нової сторінки.
const body =
  p('{{#floors}}', { sz: 2, line: 20 }) +
  // Заголовок першого поверху — без розриву сторінки, решти — з розривом (умовні блоки за полем `first`).
  p('{{#first}}', { sz: 2, line: 20 }) +
  p(TITLE, { sz: 24, bold: true, jc: 'center', after: 60 }) +
  p('{{/first}}', { sz: 2, line: 20 }) +
  p('{{^first}}', { sz: 2, line: 20 }) +
  p(TITLE, { sz: 24, bold: true, jc: 'center', after: 60, pageBreakBefore: true }) +
  p('{{/first}}', { sz: 2, line: 20 }) +
  columnsTable +
  p('', { sz: 2, line: 60 }) +
  totalTable +
  p('Чергові на кухні', { sz: 16, bold: true, before: 60, after: 30, border: true, keepNext: true }) +
  kitchenTable +
  p('', { sz: 2, line: 20 }) +
  p('{{/floors}}', { sz: 2, line: 20 }) +
  sect(1)

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const zip = new PizZip()
zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:lang w:val="uk-UA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`)
zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`)
writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`Шаблон записано: ${out}`)

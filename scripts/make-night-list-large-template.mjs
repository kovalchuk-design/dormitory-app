#!/usr/bin/env node
/**
 * Створює шаблон «Список на ніч (збільшений)» (A4 книжкова, 2 колонки, один поверх = одна сторінка):
 * дні тижня — один раз угорі кожної колонки; номер кімнати — окрема перша колонка, повернута на 90°, висотою двох перших рядків кімнати;
 * далі прізвища (кегль більший, ніж у «Списку на ніч») і сім колонок днів; знизу «Усього за добу» і блок «Чергові на кухні».
 * Реальних даних немає, лише мітки {{…}}. Службові поля макета: {{n1}}, {{n2}}, {{#hasN2}}, {{#rest}} (див. templating.ts).
 *
 *   node scripts/make-night-list-large-template.mjs <шаблон.docx>
 */
import { writeFileSync } from 'node:fs'
import PizZip from 'pizzip'

const out = process.argv[2]
if (!out) {
  console.error('Використання: node scripts/make-night-list-large-template.mjs <шаблон.docx>')
  process.exit(1)
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const FONT = 'Times New Roman'
const GRAY = 'E3E3E3'
const SUM_GRAY = 'CFCFCF'
const PAGE = { w: 11906, h: 16838, top: 420, bottom: 420, left: 567, right: 567 }
const TEXT_W = PAGE.w - PAGE.left - PAGE.right // 10772
const GAP = 284
const COL_W = Math.floor((TEXT_W - GAP) / 2) // 5244
const ROOM_W = 340 // перша колонка: номер кімнати боком
const DAY_W = 350
const NAME_W = COL_W - ROOM_W - DAY_W * 7 // 2454
const NAME_SZ = Number(process.env.NAME_SZ ?? 22) // напівпункти: 22 = 11 pt (у «Списку на ніч» — 10 pt)
const ROW_H = Number(process.env.ROW_H ?? 258) // висота рядка, twips (рядок Times 11 pt ≈ 253 twips + запас)
const ROOM_GAP = Number(process.env.ROOM_GAP ?? 30)
const KITCHEN_ROW_H = Number(process.env.KITCHEN_ROW_H ?? 250) // висота рядка для запису від руки
const KITCHEN_ROWS = Number(process.env.KITCHEN_ROWS ?? 8)

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

const NIL = { top: 'nil', left: 'nil', bottom: 'nil', right: 'nil' }
const borders = (b) => `<w:tcBorders>${Object.entries(b).map(([k, v]) => `<w:${k} w:val="${v}"${v === 'nil' ? '' : ' w:sz="4" w:space="0" w:color="000000"'}/>`).join('')}</w:tcBorders>`

function tc(width, paragraphs, { shd, vAlign = 'center', vMerge, gridSpan, textDir, b } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan ? `<w:gridSpan w:val="${gridSpan}"/>` : ''}${vMerge ? `<w:vMerge${vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${b ? borders(b) : ''}${shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : ''}${textDir ? `<w:textDirection w:val="${textDir}"/>` : ''}<w:vAlign w:val="${vAlign}"/></w:tcPr>${paragraphs}</w:tc>`
}
// Висоти рядків ТОЧНІ (hRule=exact): Word додає до «мінімальної» висоти товщину ліній (~10 twips на рядок) і вміст росте, через що
// 5-й поверх переносився на другу сторінку; з точною висотою Word і LibreOffice дають однакову сторінку.
const tr = (cells, { height } = {}) => `<w:tr><w:trPr><w:cantSplit/>${height ? `<w:trHeight w:val="${height}" w:hRule="exact"/>` : ''}</w:trPr>${cells}</w:tr>`
const tblPr = (width) =>
  `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('') +
  `</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr>`

const grid = `<w:tblGrid><w:gridCol w:w="${ROOM_W}"/><w:gridCol w:w="${NAME_W}"/>${DAYS.map(() => `<w:gridCol w:w="${DAY_W}"/>`).join('')}</w:tblGrid>`
// клітинки днів: у ОСТАННІЙ — закриваючий маркер умови/циклу рядка (відкриваючий — у першій клітинці рядка)
const dayCells = (close = '', { shd } = {}) => DAYS.map((_, i) => tc(DAY_W, p(i === DAYS.length - 1 ? close : '', { keepNext: true }), { shd })).join('')

// ---- шапка колонки: дні тижня ОДИН раз угорі колонки
const headTable = `<w:tbl>${tblPr(COL_W)}${grid}${tr(
  tc(ROOM_W, p('№', { sz: 14, bold: true, jc: 'center', keepNext: true }), { shd: GRAY }) +
    tc(NAME_W, p('Прізвище, ім’я', { bold: true, keepNext: true }), { shd: GRAY }) +
    DAYS.map((d) => tc(DAY_W, p(d, { bold: true, jc: 'center', keepNext: true }), { shd: GRAY })).join(''),
  { height: ROW_H },
)}</w:tbl>`

// ---- кімната: клітинка номера (на 90°, об'єднана рівно на два перші рядки) + прізвища + дні
const roomCell = tc(ROOM_W, p('{{room}}', { sz: 22, bold: true, jc: 'center', keepNext: true }), { vMerge: 'restart', shd: GRAY, textDir: 'btLr' })
const contCell = (marker) => tc(ROOM_W, p(marker, { keepNext: true }), { vMerge: 'continue', shd: GRAY, textDir: 'btLr' })
const blankCell = (marker) => tc(ROOM_W, p(marker, { keepNext: true }), { b: NIL })
const nameCell = (txt, opts = {}) => tc(NAME_W, p(txt, { sz: NAME_SZ, keepNext: true }), opts)
const row1 = tr(roomCell + nameCell('{{n1}}') + dayCells(), { height: ROW_H })
// 2-й рядок: другий учень (якщо є) — продовження об'єднаної клітинки
const row2 = tr(contCell('{{#hasN2}}') + nameCell('{{n2}}') + dayCells('{{/hasN2}}'), { height: ROW_H })
// єдиний учень: 2-м рядком стає підсумковий (клітинка номера завжди висотою у два рядки)
const row2single = tr(contCell('{{^hasN2}}') + tc(NAME_W, p(''), { b: { left: 'nil', bottom: 'nil' } }) + dayCells('{{/hasN2}}', { shd: GRAY }), { height: ROW_H })
// 3-й і далі: перша клітинка без ліній і заливки
const rowRest = tr(blankCell('{{#rest}}') + nameCell('{{last_first}}') + dayCells('{{/rest}}'), { height: ROW_H })
// підсумковий рядок кімнати (учнів більше одного): заливка лише в днях; клітинка під прізвищами без нижньої й лівої ліній
const rowSum = tr(blankCell('{{#hasN2}}') + tc(NAME_W, p(''), { b: { left: 'nil', bottom: 'nil' } }) + dayCells('{{/hasN2}}', { shd: GRAY }), { height: ROW_H })
const roomTable = `<w:tbl>${tblPr(COL_W)}${grid}${row1}${row2}${row2single}${rowRest}${rowSum}</w:tbl>`
const spacer = p('', { sz: 6, line: ROOM_GAP })

// ---- «Разом по колонці»
const columnSumTable = `<w:tbl>${tblPr(COL_W)}${grid}${tr(
  tc(ROOM_W + NAME_W, p('Разом по колонці', { bold: true }), { shd: SUM_GRAY, gridSpan: 2 }) + DAYS.map(() => tc(DAY_W, p(''), { shd: SUM_GRAY })).join(''),
  { height: ROW_H },
)}</w:tbl>`

const loop = (name) => headTable + p('', { sz: 2, line: 30 }) + p(`{{#${name}}}`, { sz: 2, line: 20 }) + roomTable + spacer + p(`{{/${name}}}`, { sz: 2, line: 20 }) + columnSumTable + p('', { sz: 2, line: 20 })
const outerCell = (w, content) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`
const columnsTable =
  `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((x) => `<w:${x} w:val="nil"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
  `<w:tblGrid><w:gridCol w:w="${COL_W}"/><w:gridCol w:w="${GAP}"/><w:gridCol w:w="${COL_W}"/></w:tblGrid>` +
  `<w:tr>${outerCell(COL_W, loop('roomsLeft'))}${outerCell(GAP, p(''))}${outerCell(COL_W, loop('roomsRight'))}</w:tr></w:tbl>`

// ---- «Усього за добу»: підпис на ширину двох перших колонок (ліва межа «Пн» — на лінії колонки днів)
const TOT_LABEL_W = ROOM_W + NAME_W
const TOT_DAY_W = Math.floor((TEXT_W - TOT_LABEL_W) / 7)
const TOT_DAYNAME_W = 380
const totalGrid = `<w:tblGrid><w:gridCol w:w="${TOT_LABEL_W}"/>${DAYS.map(() => `<w:gridCol w:w="${TOT_DAYNAME_W}"/><w:gridCol w:w="${TOT_DAY_W - TOT_DAYNAME_W}"/>`).join('')}</w:tblGrid>`
const grandRow = tr(
  tc(TOT_LABEL_W, p('{{floor}} поверх · усього за добу', { bold: true }), { shd: SUM_GRAY }) +
    DAYS.map((d) => tc(TOT_DAYNAME_W, p(d, { bold: true, jc: 'center' }), { shd: SUM_GRAY }) + tc(TOT_DAY_W - TOT_DAYNAME_W, p(''))).join(''),
  { height: 300 },
)
const totalTable = `<w:tbl>${tblPr(TEXT_W)}${totalGrid}${grandRow}</w:tbl>`

// ---- блок «Чергові на кухні»: дві однакові половини; у шапці — «Чергові на кухні»
const KROOM_W = 600
const KNAME_W = COL_W - KROOM_W
const kitchenGrid = `<w:tblGrid><w:gridCol w:w="${KROOM_W}"/><w:gridCol w:w="${KNAME_W}"/><w:gridCol w:w="${GAP}"/><w:gridCol w:w="${KROOM_W}"/><w:gridCol w:w="${KNAME_W}"/></w:tblGrid>`
const gapCell = `<w:tc><w:tcPr><w:tcW w:w="${GAP}" w:type="dxa"/>${borders(NIL)}<w:vAlign w:val="center"/></w:tcPr>${p('', { sz: 14 })}</w:tc>`
const kHead = (text) => tc(KROOM_W, p('Кімн.', { sz: 14, bold: true, jc: 'center' }), { shd: GRAY }) + tc(KNAME_W, p(text, { sz: 16, bold: true, jc: 'center' }), { shd: GRAY })
const kCells = () => tc(KROOM_W, p('', { sz: 14 })) + tc(KNAME_W, p('', { sz: 14 }))
const kitchenHead = tr(kHead('Чергові на кухні') + gapCell + kHead('Чергові на кухні'), { height: 240 })
const kitchenRow = tr(kCells() + gapCell + kCells(), { height: KITCHEN_ROW_H })
const kitchenTable = `<w:tbl>${tblPr(TEXT_W)}${kitchenGrid}${kitchenHead}${Array.from({ length: KITCHEN_ROWS }, () => kitchenRow).join('')}</w:tbl>`

const sect = () =>
  `<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/>` +
  `<w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="227" w:footer="227" w:gutter="0"/>` +
  `<w:cols w:space="708"/></w:sectPr>`

// Один поверх = одна сторінка; розрив сторінки між поверхами несе крихітний абзац (лише для не першого поверху).
const body =
  p('{{#floors}}', { sz: 2, line: 20 }) +
  p('{{^first}}', { sz: 2, line: 20 }) +
  p('', { sz: 2, line: 20, pageBreakBefore: true }) +
  p('{{/first}}', { sz: 2, line: 20 }) +
  columnsTable +
  p('', { sz: 2, line: 60 }) +
  totalTable +
  p('', { sz: 2, line: 60 }) +
  kitchenTable +
  p('', { sz: 2, line: Number(process.env.EXTRA ?? 20) }) + // EXTRA — лише для заміру запасу висоти
  p('{{/floors}}', { sz: 2, line: 20 }) +
  sect()

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const zip = new PizZip()
zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:lang w:val="uk-UA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`)
zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`)
writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`Шаблон записано: ${out}`)

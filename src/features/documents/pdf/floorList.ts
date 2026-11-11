import { rgb, type PDFDocument, type PDFPage } from 'pdf-lib'
import { tw, wrapText } from './layout'
import type { PdfFonts } from './types'

/**
 * «Список учнів по поверху (форма 2026-2027)»: A4 альбомна, таблиця з 9 колонок, шапка повторюється на кожній сторінці.
 * Ширини колонок — ті самі, що в шаблоні .docx (scripts/make-floor-template.mjs).
 */
const PAGE = { w: 841.89, h: 595.28 }
const WIDTHS = [567, 2276, 1400, 567, 2693, 1843, 2409, 2562, 1559].map(tw)
const X0 = tw(1134) - tw(459) // лівий край таблиці (від’ємний відступ, як у зразку)
const MARGIN_Y = tw(567)
const FS = 10
const LINE_H = FS * 1.17
const PAD_X = 3
const PAD_Y = 2.5
const MIN_ROW = 17
const BLACK = rgb(0, 0, 0)
const BORDER = 0.5

const HEADER: string[][] = [
  ['№', 'з/п'],
  ['ПІП учня (учениці)'],
  ['Дата', 'народження'],
  ['№', 'кім'],
  ['№ групи,', 'професія'],
  ['Куратор групи,', 'майстер групи'],
  ['Адреса проживання', '№ тел. учня (учениці)'],
  ['ПІП батьків,', '№ тел'],
  ['Примітка'],
]
const CENTER = new Set([0, 2, 3])

const cellsOf = (s: Record<string, string>): string[] => [
  s.index ?? '',
  s.full_name ?? '',
  s.birth_date ?? '',
  s.room ?? '',
  s.group_profession ?? '',
  s.curators ?? '',
  [s.address, s.phone_line].filter(Boolean).join('\n'),
  s.parents ?? '',
  s.social_status ?? '',
]

export async function renderFloorList(students: Record<string, string>[], fonts: PdfFonts, doc: PDFDocument): Promise<void> {
  const { regular, bold } = fonts
  const colX = WIDTHS.map((_, i) => X0 + WIDTHS.slice(0, i).reduce((a, b) => a + b, 0))

  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h])
  let y = PAGE.h - MARGIN_Y

  const drawRow = (lines: string[][], height: number, headerRow: boolean) => {
    const top = y
    lines.forEach((cellLines, i) => {
      page.drawRectangle({ x: colX[i], y: top - height, width: WIDTHS[i], height, borderColor: BLACK, borderWidth: BORDER })
      const font = headerRow ? bold : regular
      const blockH = cellLines.length * LINE_H
      let ty = top - (height - blockH) / 2 - FS * 0.88 // вертикально по центру клітинки
      for (const line of cellLines) {
        const w = font.widthOfTextAtSize(line, FS)
        const tx = headerRow || CENTER.has(i) ? colX[i] + (WIDTHS[i] - w) / 2 : colX[i] + PAD_X
        if (line) page.drawText(line, { x: tx, y: ty, size: FS, font, color: BLACK })
        ty -= LINE_H
      }
    })
    y -= height
  }
  const drawHeader = () => {
    const lines = HEADER
    drawRow(lines, Math.max(...lines.map((l) => l.length)) * LINE_H + PAD_Y * 2 + 2, true)
  }

  drawHeader()
  for (const s of students) {
    const cells = cellsOf(s)
    const wrapped = cells.map((c, i) => wrapText(c, regular, FS, WIDTHS[i] - PAD_X * 2))
    const height = Math.max(MIN_ROW, Math.max(...wrapped.map((l) => l.length)) * LINE_H + PAD_Y * 2)
    if (y - height < MARGIN_Y) {
      page = doc.addPage([PAGE.w, PAGE.h])
      y = PAGE.h - MARGIN_Y
      drawHeader()
    }
    drawRow(wrapped, height, false)
  }
}

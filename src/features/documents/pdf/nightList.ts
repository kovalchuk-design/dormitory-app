import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import { A4, tw } from './layout'
import type { PdfFloor, PdfFonts, PdfRoom } from './types'

/**
 * «Список на ніч по поверху (тиждень)»: A4 книжкова, один поверх = одна сторінка.
 * Розміри ті самі, що в шаблоні .docx (scripts/make-night-list-template.mjs), у пунктах.
 */
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const M = { top: tw(454), bottom: tw(454), left: tw(567), right: tw(567) }
const TEXT_W = A4.w - M.left - M.right
const GAP = tw(284)
const COL_W = (TEXT_W - GAP) / 2
const DAY_W = tw(405)
const NAME_W = COL_W - DAY_W * 7
const FS = 8
const BASE_ROW = tw(210)
const ROOM_GAP = tw(70)
const SUM_AFTER = 1 // службовий проміжок під підсумком колонки
const GRAY = rgb(0.89, 0.89, 0.89)
const DARK_GRAY = rgb(0.81, 0.81, 0.81)
const BLACK = rgb(0, 0, 0)
const LINE = 0.5

// фіксовані блоки під колонками
const TITLE_SIZE = 12
const TITLE_BLOCK = TITLE_SIZE * 1.15 + 3
const BETWEEN = 3
const GRAND_H = 15
const KITCHEN_LABEL_H = 3 + FS * 1.15 + 5.5
const KITCHEN_HEAD_H = 11
const KITCHEN_ROW_H = tw(255)
const KITCHEN_ROWS = 8
const KITCHEN_H = KITCHEN_LABEL_H + KITCHEN_HEAD_H + KITCHEN_ROWS * KITCHEN_ROW_H

export async function renderNightList(floors: PdfFloor[], fonts: Pick<PdfFonts, 'regular' | 'bold'>, doc: PDFDocument): Promise<void> {
  for (const f of floors) drawFloorPage(doc.addPage([A4.w, A4.h]), f, fonts)
}

const roomRows = (r: PdfRoom) => r.students.length + 2

function columnHeight(rooms: PdfRoom[], rowH: number): number {
  return rooms.reduce((h, r) => h + roomRows(r) * rowH + ROOM_GAP, 0) + rowH + SUM_AFTER
}

function drawFloorPage(page: PDFPage, floor: PdfFloor, fonts: PdfFonts) {
  const { regular, bold } = fonts
  const available = A4.h - M.top - M.bottom - TITLE_BLOCK - BETWEEN - GRAND_H - KITCHEN_H
  // якщо кімнат забагато для сторінки — рівномірно зменшуємо висоту рядків (мінімум 8,5 pt), щоб лишилась одна сторінка
  const need = Math.max(columnHeight(floor.roomsLeft, BASE_ROW), columnHeight(floor.roomsRight, BASE_ROW))
  let rowH = BASE_ROW
  if (need > available) {
    const fixed = Math.max(floor.roomsLeft.length, floor.roomsRight.length) * ROOM_GAP + SUM_AFTER
    const rows = Math.max(
      floor.roomsLeft.reduce((n, r) => n + roomRows(r), 0) + 1,
      floor.roomsRight.reduce((n, r) => n + roomRows(r), 0) + 1,
    )
    rowH = Math.max(8.5, (available - fixed) / rows)
  }

  const rect = (x: number, yTop: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: fill, borderColor: BLACK, borderWidth: LINE })
  const text = (s: string, x: number, yTop: number, h: number, size: number, o: { bold?: boolean; w?: number; center?: boolean } = {}) => {
    if (!s) return
    const font = o.bold ? bold : regular
    const width = font.widthOfTextAtSize(s, size)
    const tx = o.center && o.w != null ? x + (o.w - width) / 2 : x + 2
    page.drawText(s, { x: tx, y: yTop - h / 2 - size * 0.33, size, font, color: BLACK })
  }
  const row = (x: number, yTop: number, h: number, nameText: string, o: { fill?: ReturnType<typeof rgb>; boldName?: boolean; days?: boolean } = {}) => {
    rect(x, yTop, NAME_W, h, o.fill)
    text(nameText, x, yTop, h, FS, { bold: o.boldName })
    DAYS.forEach((d, i) => {
      const dx = x + NAME_W + i * DAY_W
      rect(dx, yTop, DAY_W, h, o.fill)
      if (o.days) text(d, dx, yTop, h, FS, { bold: true, center: true, w: DAY_W })
    })
  }

  // заголовок
  const title = `СПИСОК учнів, які залишаються в гуртожитку на ніч — ${floor.floor} поверх`
  const tw0 = bold.widthOfTextAtSize(title, TITLE_SIZE)
  page.drawText(title, { x: (A4.w - tw0) / 2, y: A4.h - M.top - TITLE_SIZE * 0.95, size: TITLE_SIZE, font: bold, color: BLACK })
  const colTop = A4.h - M.top - TITLE_BLOCK

  // дві колонки кімнат
  const drawColumn = (x0: number, rooms: PdfRoom[]): number => {
    let y = colTop
    for (const r of rooms) {
      row(x0, y, rowH, `Кімната ${r.room}`, { boldName: true, days: true })
      y -= rowH
      for (const s of r.students) {
        row(x0, y, rowH, s.last_first)
        y -= rowH
      }
      row(x0, y, rowH, '', { fill: GRAY })
      y -= rowH + ROOM_GAP
    }
    // підсумок колонки
    rect(x0, y, NAME_W, rowH, DARK_GRAY)
    text('Разом по колонці', x0, y, rowH, FS, { bold: true })
    DAYS.forEach((_, i) => rect(x0 + NAME_W + i * DAY_W, y, DAY_W, rowH, DARK_GRAY))
    return y - rowH - SUM_AFTER
  }
  const yLeft = drawColumn(M.left, floor.roomsLeft)
  const yRight = drawColumn(M.left + COL_W + GAP, floor.roomsRight)
  let y = Math.min(yLeft, yRight) - BETWEEN

  // «Усього за добу»
  const LABEL_W = tw(1900)
  const DAYBLOCK = (TEXT_W - LABEL_W) / 7
  const DAYNAME_W = tw(380)
  rect(M.left, y, LABEL_W, GRAND_H, DARK_GRAY)
  text('Усього за добу', M.left, y, GRAND_H, FS, { bold: true })
  DAYS.forEach((d, i) => {
    const x = M.left + LABEL_W + i * DAYBLOCK
    rect(x, y, DAYNAME_W, GRAND_H, DARK_GRAY)
    text(d, x, y, GRAND_H, FS, { bold: true, center: true, w: DAYNAME_W })
    rect(x + DAYNAME_W, y, DAYBLOCK - DAYNAME_W, GRAND_H)
  })
  y -= GRAND_H

  // «Чергові на кухні»
  page.drawLine({ start: { x: M.left, y: y - 3 }, end: { x: M.left + TEXT_W, y: y - 3 }, thickness: 0.75, color: rgb(0.5, 0.5, 0.5) })
  page.drawText('Чергові на кухні', { x: M.left, y: y - 3 - 4 - FS * 0.9, size: FS, font: bold, color: BLACK })
  y -= KITCHEN_LABEL_H
  const KROOM = 30
  const KNAME = COL_W - KROOM
  for (const x0 of [M.left, M.left + COL_W + GAP]) {
    rect(x0, y, KROOM, KITCHEN_HEAD_H, GRAY)
    text('Кімн.', x0, y, KITCHEN_HEAD_H, 7, { bold: true, center: true, w: KROOM })
    rect(x0 + KROOM, y, KNAME, KITCHEN_HEAD_H, GRAY)
    text('Прізвище, ім’я, по батькові', x0 + KROOM, y, KITCHEN_HEAD_H, 7, { bold: true, center: true, w: KNAME })
    for (let i = 0; i < KITCHEN_ROWS; i++) {
      const ry = y - KITCHEN_HEAD_H - i * KITCHEN_ROW_H
      rect(x0, ry, KROOM, KITCHEN_ROW_H)
      rect(x0 + KROOM, ry, KNAME, KITCHEN_ROW_H)
    }
  }
}

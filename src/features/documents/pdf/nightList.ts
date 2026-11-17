import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import { A4, tw } from './layout'
import type { PdfFloor, PdfFonts, PdfRoom } from './types'

/**
 * «Список на ніч по поверху (тиждень)»: A4 книжкова, один поверх = одна сторінка.
 * Розміри ті самі, що в шаблоні .docx (scripts/make-night-list-template.mjs), у пунктах.
 */
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const M = { top: tw(420), bottom: tw(420), left: tw(567), right: tw(567) }
const TEXT_W = A4.w - M.left - M.right
const GAP = tw(284)
const COL_W = (TEXT_W - GAP) / 2
const DAY_W = tw(405)
const NAME_W = COL_W - DAY_W * 7
const FS = 8
const NAME_FS = 10 // прізвища учнів (як у шаблоні .docx: NAME_SZ = 20 напівпунктів)
const BASE_ROW = tw(230)
const ROOM_GAP = tw(30)
const SUM_AFTER = 1 // службовий проміжок під підсумком колонки
const GRAY = rgb(0.89, 0.89, 0.89)
const DARK_GRAY = rgb(0.81, 0.81, 0.81)
const BLACK = rgb(0, 0, 0)
const LINE = 0.5

// фіксовані блоки під колонками
const TITLE_BLOCK = 0 // заголовка немає: звільнену висоту віддано під більший шрифт; номер поверху — у підписі «Усього за добу»
const BETWEEN = 3
const GRAND_H = 15
const KITCHEN_LABEL_H = 3 // тонкий проміжок над блоком (підпис «Чергові на кухні» тепер у шапці таблиці)
const KITCHEN_HEAD_H = 12
const KITCHEN_ROW_H = tw(250) // ФІКСОВАНА висота рядка для рукопису (як у шаблоні .docx); не підлаштовується під вільне місце на сторінці
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
  const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: LINE, color: BLACK })
  const row = (x: number, yTop: number, h: number, nameText: string, o: { fill?: ReturnType<typeof rgb>; nameFill?: ReturnType<typeof rgb> | null; noBottom?: boolean; boldName?: boolean; days?: boolean; nameSize?: number } = {}) => {
    if (o.noBottom) {
      // порожня клітинка під прізвищами без нижньої й лівої ліній: лишаються верх і право (межа з клітинкою днів)
      line(x, yTop, x + NAME_W, yTop)
      line(x + NAME_W, yTop, x + NAME_W, yTop - h)
    } else rect(x, yTop, NAME_W, h, o.nameFill === undefined ? o.fill : (o.nameFill ?? undefined))
    text(nameText, x, yTop, h, o.nameSize ?? FS, { bold: o.boldName })
    DAYS.forEach((d, i) => {
      const dx = x + NAME_W + i * DAY_W
      rect(dx, yTop, DAY_W, h, o.fill)
      if (o.days) text(d, dx, yTop, h, FS, { bold: true, center: true, w: DAY_W })
    })
  }

  const colTop = A4.h - M.top - TITLE_BLOCK

  // дві колонки кімнат
  const drawColumn = (x0: number, rooms: PdfRoom[]): number => {
    let y = colTop
    for (const r of rooms) {
      row(x0, y, rowH, `Кімната ${r.room}`, { boldName: true, days: true, nameFill: GRAY }) // сірим залита лише клітинка з номером кімнати
      y -= rowH
      for (const s of r.students) {
        row(x0, y, rowH, s.last_first, { nameSize: NAME_FS })
        y -= rowH
      }
      row(x0, y, rowH, '', { fill: GRAY, nameFill: null, noBottom: true }) // підсумковий рядок: заливка лише в клітинках днів
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
  const LABEL_W = NAME_W // ліва межа «Пн» — на лінії колонки днів у таблицях кімнат
  const DAYBLOCK = (TEXT_W - LABEL_W) / 7
  const DAYNAME_W = tw(380)
  rect(M.left, y, LABEL_W, GRAND_H, DARK_GRAY)
  text(`${floor.floor} поверх · усього за добу`, M.left, y, GRAND_H, FS, { bold: true })
  DAYS.forEach((d, i) => {
    const x = M.left + LABEL_W + i * DAYBLOCK
    rect(x, y, DAYNAME_W, GRAND_H, DARK_GRAY)
    text(d, x, y, GRAND_H, FS, { bold: true, center: true, w: DAYNAME_W })
    rect(x + DAYNAME_W, y, DAYBLOCK - DAYNAME_W, GRAND_H)
  })
  y -= GRAND_H

  // «Чергові на кухні»
  y -= KITCHEN_LABEL_H
  const kitchenRowH = KITCHEN_ROW_H
  const KROOM = 30
  const KNAME = COL_W - KROOM
  for (const x0 of [M.left, M.left + COL_W + GAP]) {
    rect(x0, y, KROOM, KITCHEN_HEAD_H, GRAY)
    text('Кімн.', x0, y, KITCHEN_HEAD_H, 7, { bold: true, center: true, w: KROOM })
    rect(x0 + KROOM, y, KNAME, KITCHEN_HEAD_H, GRAY)
    text('Чергові на кухні', x0 + KROOM, y, KITCHEN_HEAD_H, 8, { bold: true, center: true, w: KNAME })
    for (let i = 0; i < KITCHEN_ROWS; i++) {
      const ry = y - KITCHEN_HEAD_H - i * kitchenRowH
      rect(x0, ry, KROOM, kitchenRowH)
      rect(x0 + KROOM, ry, KNAME, kitchenRowH)
    }
  }
}

import { PDFDocument, degrees, rgb, type PDFPage } from 'pdf-lib'
import { A4, tw } from './layout'
import type { PdfFloor, PdfFonts, PdfRoom } from './types'

/**
 * «Список на ніч (збільшений)»: A4 книжкова, один поверх = одна сторінка.
 * Відмінності від «Списку на ніч»: дні тижня друкуються один раз угорі кожної колонки (а не в кожній кімнаті);
 * номер кімнати — повернутий на 90° у першій колонці й має фіксовану висоту двох перших рядків кімнати;
 * звільнену висоту віддано під більший кегль прізвищ. Розміри ті самі, що в scripts/make-night-list-large-template.mjs.
 */
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const M = { top: tw(420), bottom: tw(420), left: tw(567), right: tw(567) }
const TEXT_W = A4.w - M.left - M.right
const GAP = tw(284)
const COL_W = (TEXT_W - GAP) / 2
const ROOM_W = tw(340) // перша колонка: номер кімнати боком
const DAY_W = tw(350)
const NAME_W = COL_W - ROOM_W - DAY_W * 7
const ROOM_GAP = tw(30)
const BASE_ROW = tw(258) // ФІКСОВАНА висота рядка з прізвищем (як у шаблоні .docx); лишається такою на всіх поверхах
const FS_NAME = 11 // кегль прізвищ (як у шаблоні .docx)
const FS_SMALL = 8
const GRAY = rgb(0.89, 0.89, 0.89)
const DARK_GRAY = rgb(0.81, 0.81, 0.81)
const BLACK = rgb(0, 0, 0)
const LINE = 0.5
const GRAND_H = 15
const KITCHEN_HEAD_H = 12
const KITCHEN_ROW_H = tw(320) // ФІКСОВАНА висота рядка для рукопису (як у шаблоні .docx): визначена за найзаселенішим (5-м) поверхом і та сама на всіх поверхах
const KITCHEN_ROWS = 8
const BETWEEN = 3

export async function renderNightListLarge(floors: PdfFloor[], fonts: Pick<PdfFonts, 'regular' | 'bold'>, doc: PDFDocument): Promise<void> {
  for (const f of floors) drawFloorPage(doc.addPage([A4.w, A4.h]), f, fonts)
}

/** Рядків у колонці: шапка + (учні + підсумковий рядок) кожної кімнати + «Разом по колонці». */
const columnRows = (rooms: PdfRoom[]) => 1 + rooms.reduce((n, r) => n + Math.max(r.students.length, 1) + 1, 0) + 1

function drawFloorPage(page: PDFPage, floor: PdfFloor, { regular, bold }: Pick<PdfFonts, 'regular' | 'bold'>) {
  const maxRows = Math.max(columnRows(floor.roomsLeft), columnRows(floor.roomsRight))
  const maxRooms = Math.max(floor.roomsLeft.length, floor.roomsRight.length)
  const kitchenMin = KITCHEN_HEAD_H + KITCHEN_ROWS * KITCHEN_ROW_H
  const available = A4.h - M.top - M.bottom - BETWEEN - GRAND_H - 3 - kitchenMin
  // Висота рядка фіксована й не підлаштовується під сторінку (менш заселений поверх не розтягуємо). Стискаємо лише тоді,
  // коли поверх інакше не вмістився б на одну сторінку.
  const fit = (available - maxRooms * ROOM_GAP - 1) / maxRows
  const rowH = Math.min(BASE_ROW, fit)
  const FS = Math.min(FS_NAME, Math.floor((rowH / 1.16) * 4) / 4)

  const rect = (x: number, yTop: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: fill, borderColor: BLACK, borderWidth: LINE })
  const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: LINE, color: BLACK })
  const text = (s: string, x: number, yTop: number, h: number, size: number, o: { bold?: boolean; w?: number; center?: boolean } = {}) => {
    if (!s) return
    const font = o.bold ? bold : regular
    const width = font.widthOfTextAtSize(s, size)
    page.drawText(s, { x: o.center && o.w != null ? x + (o.w - width) / 2 : x + 2, y: yTop - h / 2 - size * 0.33, size, font, color: BLACK })
  }
  const dayCells = (x: number, y: number, h: number, fill?: ReturnType<typeof rgb>, label = false) =>
    DAYS.forEach((d, i) => {
      const dx = x + ROOM_W + NAME_W + i * DAY_W
      rect(dx, y, DAY_W, h, fill)
      if (label) text(d, dx, y, h, FS_SMALL, { bold: true, center: true, w: DAY_W })
    })

  const colTop = A4.h - M.top
  const column = (x0: number, rooms: PdfRoom[]): number => {
    let y = colTop
    // єдина шапка колонки: дні тижня лише тут
    rect(x0, y, ROOM_W, rowH, GRAY)
    text('№', x0, y, rowH, 7, { bold: true, center: true, w: ROOM_W })
    rect(x0 + ROOM_W, y, NAME_W, rowH, GRAY)
    text('Прізвище, ім’я', x0 + ROOM_W, y, rowH, FS_SMALL, { bold: true })
    dayCells(x0, y, rowH, GRAY, true)
    y -= rowH
    for (const r of rooms) {
      // клітинка номера: завжди рівно два перші рядки кімнати, текст повернуто на 90° (знизу вгору)
      const h2 = 2 * rowH
      rect(x0, y, ROOM_W, h2, GRAY)
      const size = Math.min(11, ROOM_W - 5), w = bold.widthOfTextAtSize(r.room, size)
      page.drawText(r.room, { x: x0 + ROOM_W / 2 + size * 0.35, y: y - h2 / 2 - w / 2, size, font: bold, color: BLACK, rotate: degrees(90) })
      for (const s of r.students) {
        rect(x0 + ROOM_W, y, NAME_W, rowH)
        text(s.last_first, x0 + ROOM_W, y, rowH, FS)
        dayCells(x0, y, rowH)
        y -= rowH
      }
      // підсумковий рядок кімнати: сірі лише клітинки днів; клітинка під прізвищами без нижньої лінії
      line(x0 + ROOM_W, y, x0 + ROOM_W + NAME_W, y)
      line(x0 + ROOM_W + NAME_W, y, x0 + ROOM_W + NAME_W, y - rowH)
      dayCells(x0, y, rowH, GRAY)
      y -= rowH + ROOM_GAP
    }
    rect(x0, y, ROOM_W + NAME_W, rowH, DARK_GRAY)
    text('Разом по колонці', x0, y, rowH, FS_SMALL, { bold: true })
    dayCells(x0, y, rowH, DARK_GRAY)
    return y - rowH
  }
  const yLeft = column(M.left, floor.roomsLeft)
  const yRight = column(M.left + COL_W + GAP, floor.roomsRight)
  let y = Math.min(yLeft, yRight) - BETWEEN

  // «Усього за добу»: підпис на ширину двох перших колонок, «Пн» — на лінії колонки днів
  const LABEL_W = ROOM_W + NAME_W
  const DAYBLOCK = (TEXT_W - LABEL_W) / 7
  const DAYNAME_W = tw(380)
  rect(M.left, y, LABEL_W, GRAND_H, DARK_GRAY)
  text(`${floor.floor} поверх · усього за добу`, M.left, y, GRAND_H, FS_SMALL, { bold: true })
  DAYS.forEach((d, i) => {
    const x = M.left + LABEL_W + i * DAYBLOCK
    rect(x, y, DAYNAME_W, GRAND_H, DARK_GRAY)
    text(d, x, y, GRAND_H, FS_SMALL, { bold: true, center: true, w: DAYNAME_W })
    rect(x + DAYNAME_W, y, DAYBLOCK - DAYNAME_W, GRAND_H)
  })
  y -= GRAND_H + 3

  // «Чергові на кухні»: фіксована висота рядків (не підлаштовується під вільне місце сторінки)
  const kitchenRowH = KITCHEN_ROW_H
  const KROOM = 30
  const KNAME = COL_W - KROOM
  for (const x0 of [M.left, M.left + COL_W + GAP]) {
    rect(x0, y, KROOM, KITCHEN_HEAD_H, GRAY)
    text('Кімн.', x0, y, KITCHEN_HEAD_H, 7, { bold: true, center: true, w: KROOM })
    rect(x0 + KROOM, y, KNAME, KITCHEN_HEAD_H, GRAY)
    text('Чергові на кухні', x0 + KROOM, y, KITCHEN_HEAD_H, FS_SMALL, { bold: true, center: true, w: KNAME })
    for (let i = 0; i < KITCHEN_ROWS; i++) {
      const ry = y - KITCHEN_HEAD_H - i * kitchenRowH
      rect(x0, ry, KROOM, kitchenRowH)
      rect(x0 + KROOM, ry, KNAME, kitchenRowH)
    }
  }
}

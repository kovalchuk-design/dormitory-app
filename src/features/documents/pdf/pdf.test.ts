import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildTemplateData } from '../templating'
import { detectPdfKind } from './index'
import { renderPdf } from './render'
import { wrapText } from './layout'

const fonts = {
  regular: readFileSync(new URL('./fonts/LiberationSerif-Regular.ttf', import.meta.url)),
  bold: readFileSync(new URL('./fonts/LiberationSerif-Bold.ttf', import.meta.url)),
}

const fake = (perFloor: Record<number, number[]>) => {
  const students: { last_name: string; first_name: string; patronymic: string; grade: number; room: string; floor: number }[] = []
  let n = 0
  for (const [fl, counts] of Object.entries(perFloor)) {
    counts.forEach((c, ri) => {
      for (let k = 0; k < c; k++) {
        n++
        students.push({ last_name: `ТЕСТ_Прізвище${n}`, first_name: `Ім${n}`, patronymic: `По${n}`, grade: 10, room: fl + String(ri).padStart(2, '0'), floor: Number(fl) })
      }
    })
  }
  return buildTemplateData({ students, educatorName: 'ТЕСТ', yearName: null })
}

const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount()

describe('PDF: визначення типу за полями шаблону', () => {
  it('розпізнає шаблони, що мають PDF-вигляд', () => {
    expect(detectPdfKind(['floors', 'first', 'floor', 'roomsLeft', 'roomsRight', 'room', 'students', 'last_first'])).toBe('night')
    expect(detectPdfKind(['index', 'full_name', 'curators', 'students'])).toBe('floorList')
    expect(detectPdfKind(['full_name'])).toBeNull()
  })
})

describe('PDF: «Список на ніч» — один поверх = одна сторінка', () => {
  it('4 поверхи → 4 сторінки, у т.ч. для найбільшого поверху', async () => {
    const data = fake({ 2: [5, 5, 5, 5, 5, 5, 5, 5, 5, 3], 3: [5, 5, 4, 5, 4, 5, 5, 5], 4: [5, 4, 5, 3, 4, 5, 6, 5, 5, 4, 5, 5, 5, 5], 5: [5, 4, 5, 3, 4, 5, 7, 5, 6, 4, 5, 5, 5, 5, 5, 3] })
    expect(await pages(await renderPdf('night', data, fonts))).toBe(4)
  })
  it('поверх із надлишком кімнат усе одно на одній сторінці (рядки стискаються)', async () => {
    const data = fake({ 5: Array.from({ length: 22 }, () => 6) })
    expect(await pages(await renderPdf('night', data, fonts))).toBe(1)
  })
})

describe('PDF: «Список учнів по поверху»', () => {
  it('довгий список переходить на кілька сторінок', async () => {
    const data = fake({ 2: Array.from({ length: 12 }, () => 5) })
    expect(await pages(await renderPdf('floorList', data, fonts))).toBeGreaterThan(1)
  })
  it('короткий список — одна сторінка', async () => {
    expect(await pages(await renderPdf('floorList', fake({ 2: [5] }), fonts))).toBe(1)
  })
})

describe('wrapText: без переносів слів', () => {
  const font = { widthOfTextAtSize: (s: string, size: number) => s.length * size * 0.5 }
  it('ділить лише за пробілами й \\n', () => {
    expect(wrapText('Васильович Дмитро', font, 10, 60)).toEqual(['Васильович', 'Дмитро'])
    expect(wrapText('А\nБ', font, 10, 100)).toEqual(['А', 'Б'])
  })
  it('надто довге слово ріжеться посимвольно', () => {
    expect(wrapText('ААААААААААААА', font, 10, 30).length).toBeGreaterThan(1)
  })
})

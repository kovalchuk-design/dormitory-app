import type { PDFFont } from 'pdf-lib'

export interface PdfFonts {
  regular: PDFFont
  bold: PDFFont
}

/** Які шаблони вміють PDF (за службовими полями шаблону). */
export type PdfKind = 'night' | 'floorList'

export interface PdfRoom {
  room: string
  students: { last_first: string }[]
}
export interface PdfFloor {
  floor: string
  roomsLeft: PdfRoom[]
  roomsRight: PdfRoom[]
}

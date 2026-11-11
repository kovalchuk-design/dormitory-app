import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { renderNightList } from './nightList'
import { renderFloorList } from './floorList'
import type { PdfFloor, PdfFonts, PdfKind } from './types'
import { A4 } from './layout'

export interface PdfFontBytes {
  regular: ArrayBuffer | Uint8Array
  bold: ArrayBuffer | Uint8Array
}

/** Чиста функція: дані шаблону → байти PDF (шрифти передаються ззовні, щоб це можна було тестувати без браузера). */
export async function renderPdf(kind: PdfKind, data: Record<string, unknown>, fontBytes: PdfFontBytes): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts: PdfFonts = {
    regular: await doc.embedFont(fontBytes.regular, { subset: true }),
    bold: await doc.embedFont(fontBytes.bold, { subset: true }),
  }
  if (kind === 'night') await renderNightList((data.floors as PdfFloor[]) ?? [], fonts, doc)
  else await renderFloorList((data.students as Record<string, string>[]) ?? [], fonts, doc)
  if (doc.getPageCount() === 0) doc.addPage([A4.w, A4.h])
  return doc.save()
}

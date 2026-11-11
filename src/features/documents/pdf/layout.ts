import type { PDFFont } from 'pdf-lib'

/** Розбиття тексту на рядки по ширині: лише за пробілами й «\n», БЕЗ переносів слів. Дуже довге слово ріжеться посимвольно. */
export function wrapText(text: string, font: Pick<PDFFont, 'widthOfTextAtSize'>, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word
        continue
      }
      // слово ширше за клітинку — ріжемо посимвольно, інакше воно вилізе за межі
      let chunk = ''
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
          lines.push(chunk)
          chunk = ''
        }
        chunk += ch
      }
      line = chunk
    }
    lines.push(line)
  }
  return lines
}

/** twips → пункти (1 pt = 20 twips): розміри в PDF беруться з тих самих чисел, що й у шаблонах .docx. */
export const tw = (n: number) => n / 20

export const A4 = { w: 595.28, h: 841.89 }

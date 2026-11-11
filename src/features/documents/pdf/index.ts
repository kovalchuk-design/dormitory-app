import type { PdfKind } from './types'

export type { PdfKind } from './types'

/** Який PDF-вигляд має шаблон: визначається за службовими полями шаблону (див. README, «PDF»). */
export function detectPdfKind(placeholders: readonly string[]): PdfKind | null {
  if (placeholders.includes('floors') && placeholders.includes('last_first')) return 'night'
  if (placeholders.includes('students') && placeholders.includes('curators')) return 'floorList'
  return null
}

/**
 * У браузері: підвантажує бібліотеку PDF і шрифти (лише при натисканні «PDF» — на швидкість сайту це не впливає)
 * та повертає готовий PDF.
 */
export async function buildPdf(kind: PdfKind, data: Record<string, unknown>): Promise<Uint8Array> {
  const [{ renderPdf }, regularUrl, boldUrl] = await Promise.all([
    import('./render'),
    import('./fonts/LiberationSerif-Regular.ttf?url').then((m) => m.default),
    import('./fonts/LiberationSerif-Bold.ttf?url').then((m) => m.default),
  ])
  const [regular, bold] = await Promise.all([regularUrl, boldUrl].map(async (u) => (await fetch(u)).arrayBuffer()))
  return renderPdf(kind, data, { regular, bold })
}

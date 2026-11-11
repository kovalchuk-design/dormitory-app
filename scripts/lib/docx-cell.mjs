/**
 * Єдині правила оформлення таблиць у шаблонах документів (див. README, розділ «Документи»):
 *  1. Текст у КОЖНІЙ клітинці вирівняний по центру за висотою (vAlign = center) — і в заголовках, і в даних.
 *  2. Короткі числові колонки (№ з/п, № кімнати, дата) і заголовки — ще й по центру за шириною.
 *  3. Довгий текст (ПІБ, адреса) — по лівому краю.
 *  4. Переносів слів немає: ПІБ переходить на новий рядок цілими словами («Васильович», а не «Васи-льович»).
 */

/** Додає `<w:vAlign w:val="center"/>` у tcPr клітинки (якщо ще немає), з урахуванням порядку елементів OOXML. */
export function ensureVCenter(cellXml) {
  if (cellXml.includes('<w:vAlign')) return cellXml.replace(/<w:vAlign w:val="[^"]*"\/>/, '<w:vAlign w:val="center"/>')
  const tag = '<w:vAlign w:val="center"/>'
  if (cellXml.includes('<w:hideMark/>')) return cellXml.replace('<w:hideMark/>', `${tag}<w:hideMark/>`)
  return cellXml.replace('</w:tcPr>', `${tag}</w:tcPr>`)
}

/** Забороняє автоматичні переноси слів в абзаці (`suppressAutoHyphens`), зберігаючи порядок елементів у pPr. */
export function noHyphenPPr(pPrXml) {
  if (pPrXml.includes('<w:suppressAutoHyphens')) return pPrXml
  const tag = '<w:suppressAutoHyphens/>'
  for (const before of ['<w:spacing', '<w:ind', '<w:jc', '<w:rPr>']) {
    if (pPrXml.includes(before)) return pPrXml.replace(before, `${tag}${before}`)
  }
  return pPrXml.replace('</w:pPr>', `${tag}</w:pPr>`)
}

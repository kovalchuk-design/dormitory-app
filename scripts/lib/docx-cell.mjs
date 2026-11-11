/**
 * Єдині правила оформлення таблиць у шаблонах документів (див. README, розділ «Документи»):
 *  1. Текст у КОЖНІЙ клітинці вирівняний по центру за висотою (vAlign = center) — і в заголовках, і в даних.
 *  2. Короткі числові колонки (№ з/п, № кімнати, дата) і заголовки — ще й по центру за шириною.
 *  3. Довгий текст (ПІБ, адреса) — по лівому краю.
 */

/** Додає `<w:vAlign w:val="center"/>` у tcPr клітинки (якщо ще немає), з урахуванням порядку елементів OOXML. */
export function ensureVCenter(cellXml) {
  if (cellXml.includes('<w:vAlign')) return cellXml.replace(/<w:vAlign w:val="[^"]*"\/>/, '<w:vAlign w:val="center"/>')
  const tag = '<w:vAlign w:val="center"/>'
  if (cellXml.includes('<w:hideMark/>')) return cellXml.replace('<w:hideMark/>', `${tag}<w:hideMark/>`)
  return cellXml.replace('</w:tcPr>', `${tag}</w:tcPr>`)
}

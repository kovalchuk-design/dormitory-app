const BOM = String.fromCharCode(0xfeff)
const SEP = ';' // українська локаль Excel очікує «;»

/** Один осередок CSV: екранування лапок/роздільників і захист від CSV-ін'єкцій (=, @, +, -). */
export function csvCell(value: unknown, sep: string = SEP): string {
  let s = value == null ? '' : String(value)
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s))) s = `'${s}`
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV з BOM (щоб Excel розпізнав UTF-8) і CRLF. */
export function toCsv(headers: string[], rows: unknown[][], sep: string = SEP): string {
  const lines = [headers, ...rows].map((r) => r.map((c) => csvCell(c, sep)).join(sep))
  return `${BOM}${lines.join('\r\n')}\r\n`
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

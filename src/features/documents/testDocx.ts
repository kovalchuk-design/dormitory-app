// Допоміжне для тестів: збирає мінімальний валідний .docx з вигаданим вмістом (без реальних даних).
import PizZip from 'pizzip'

export function buildDocx(bodyXml: string): Uint8Array {
  const zip = new PizZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  )
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' })
}

export const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
/** Абзац, у якому один тег розбито на кілька «ранів» — як це часто робить Word. */
export const splitP = (a: string, b: string, c: string) =>
  `<w:p><w:r><w:t>${a}</w:t></w:r><w:r><w:t>${b}</w:t></w:r><w:r><w:t>${c}</w:t></w:r></w:p>`
export const cell = (inner: string) => `<w:tc>${inner}</w:tc>`
export const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`
export const table = (...rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`

import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import {
  buildStudentFields,
  buildTemplateData,
  checkTemplate,
  extractPlaceholders,
  formatDate,
  placeholderSnippet,
  renderDocxTemplate,
  studentSnippet,
  shortName,
  type StudentSource,
} from './templating'
import { buildDocx, cell, p, row, splitP, table } from './testDocx'

const a: StudentSource = { last_name: 'Тестенко', first_name: 'Олег', patronymic: 'Іванович', birth_date: '2010-03-09', grade: 10, room: '305', floor: 3, group_number: '12', mother_phone: '+380000000001' }
const b: StudentSource = { last_name: 'Прикладна', first_name: 'Ася', patronymic: null, grade: 9, room: '305', floor: 3 }
const c: StudentSource = { last_name: 'Взірець', first_name: 'Іван', grade: 11, room: '412', floor: 4 }

const bodyText = async (blob: Blob) => {
  const zip = new PizZip(await blob.arrayBuffer())
  return zip.files['word/document.xml'].asText().replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
}

describe('форматування', () => {
  it('дата і імена', () => {
    expect(formatDate('2010-03-09')).toBe('09.03.2010')
    expect(formatDate(new Date(2026, 10, 9))).toBe('09.11.2026')
    expect(formatDate(null)).toBe('')
    expect(shortName(a)).toBe('Тестенко О.І.')
    expect(shortName(b)).toBe('Прикладна А.')
  })
  it('поля учня: порожні значення стають порожніми рядками', () => {
    const f = buildStudentFields(b)
    expect(f.full_name).toBe('Прикладна Ася')
    expect(f.birth_date).toBe('')
    expect(f.mother_phone).toBe('')
    expect(Object.values(f).every((v) => typeof v === 'string')).toBe(true)
  })
  it('buildTemplateData: спільна кімната/поверх лише коли збігаються', () => {
    const same = buildTemplateData({ students: [a, b], educatorName: 'Вихователь', yearName: '2026/2027', today: new Date(2026, 10, 9) })
    expect(same).toMatchObject({ room: '305', floor: '3', count: '2', date: '09.11.2026', year: '2026/2027' })
    const mixed = buildTemplateData({ students: [a, c], educatorName: 'В', yearName: null })
    expect(mixed).toMatchObject({ room: '', floor: '' })
  })
  it('extractPlaceholders', () => {
    expect(extractPlaceholders('{{ student.full_name }} {{#students}}{{full_name}}{{/students}} {{date}} {{date}}'))
      .toEqual(['student.full_name', 'students', 'full_name', 'date'])
  })
})

describe('довідка: фрагменти для вставки', () => {
  it('формує мітки для одного учня й для рядка таблиці', () => {
    expect(placeholderSnippet('date')).toBe('{{date}}')
    expect(placeholderSnippet('students')).toBe('{{#students}}…{{/students}}')
    expect(studentSnippet('full_name', 'single')).toBe('{{student.full_name}}')
    expect(studentSnippet('full_name', 'row')).toBe('{{full_name}}')
  })
})

describe('docxtemplater', () => {
  it('підставляє поля одного учня, зокрема тег, розбитий на кілька ранів', async () => {
    const tpl = buildDocx(p('Учень: {{student.full_name}}, кімната {{room}}') + splitP('Дата: {{da', 'te', '}}'))
    const out = await renderDocxTemplate(tpl, buildTemplateData({ students: [a], educatorName: 'В', yearName: null, today: new Date(2026, 10, 9) }))
    const text = await bodyText(out)
    expect(text).toContain('Учень: Тестенко Олег Іванович, кімната 305')
    expect(text).toContain('Дата: 09.11.2026')
  })
  it('повторює рядок таблиці для кожного учня', async () => {
    const tpl = buildDocx(
      p('Список, кімната {{room}}') +
        table(
          row(cell(p('№')), cell(p('ПІБ'))),
          row(cell(p('{{#students}}{{index}}')), cell(p('{{full_name}} ({{student.grade}} кл.){{/students}}'))),
        ),
    )
    const out = await renderDocxTemplate(tpl, buildTemplateData({ students: [a, b], educatorName: 'В', yearName: null }))
    const text = await bodyText(out)
    expect(text).toContain('1')
    expect(text).toContain('Тестенко Олег Іванович (10 кл.)')
    expect(text).toContain('Прикладна Ася (9 кл.)')
    const zip = new PizZip(await out.arrayBuffer())
    expect(zip.files['word/document.xml'].asText().match(/<w:tr>/g)).toHaveLength(3) // заголовок + 2 учні
  })
  it('невідоме поле стає порожнім, а не «undefined»', async () => {
    const out = await renderDocxTemplate(buildDocx(p('[{{nope}}][{{student.mother_name}}]')), buildTemplateData({ students: [b], educatorName: 'В', yearName: null }))
    expect(await bodyText(out)).toContain('[][]')
  })
  it('checkTemplate: збирає поля і виявляє зламаний шаблон', async () => {
    const ok = await checkTemplate(buildDocx(p('{{student.full_name}} {{date}}')))
    expect(ok.error).toBeNull()
    expect(ok.placeholders).toEqual(['student.full_name', 'date'])
    const bad = await checkTemplate(buildDocx(p('{{#students}} без закриття')))
    expect(bad.error).toBeTruthy()
    const notDocx = await checkTemplate(new TextEncoder().encode('це не docx'))
    expect(notDocx.error).toBeTruthy()
  })
})

describe('форма «Список учнів по поверху»', () => {
  it('сортує за кімнатою й алфавітом, склеює батьків, соціальний статус і телефон', () => {
    const base = { first_name: 'Ім', grade: 10 }
    const data = buildTemplateData({
      students: [
        { ...base, last_name: 'Яр', room: '502', mother_name: 'Мати', mother_phone: '1', father_name: 'Батько' },
        { ...base, last_name: 'Бойко', room: '500', social_status: 'Напівсирота', student_phone: '2' },
        { ...base, last_name: 'Артем', room: '500' },
      ],
      educatorName: 'В',
      yearName: null,
    })
    const rows = data.students as Record<string, string>[]
    expect(rows.map((r) => r.last_name)).toEqual(['Артем', 'Бойко', 'Яр'])
    expect(rows[1].social_status).toBe('Напівсирота')
    expect(rows[1].phone_line).toBe('тел. 2')
    expect(rows[0].phone_line).toBe('')
    expect(buildTemplateData({ students: [{ ...base, last_name: 'Г', group_number: '2', profession: 'Кухар' }, { ...base, last_name: 'Д', group_number: '3' }, { ...base, last_name: 'Е' }], educatorName: 'В', yearName: null }).students).toMatchObject([{ group_profession: '2, «Кухар»' }, { group_profession: '3' }, { group_profession: '' }])
    expect(buildTemplateData({ students: [{ ...base, last_name: 'К', class_teacher: 'Кл', master: ' Майстер ' }], educatorName: 'В', yearName: null }).student).toMatchObject({ curators: 'Кл\nМайстер' })
    expect(rows[2].parents).toBe('Мати, тел. 1\nБатько')
  })
})

describe('loadChunk (ліниве завантаження)', () => {
  it('розпізнає помилку застарілого файлу й не чіпає інші', async () => {
    const { isChunkLoadError, loadChunk } = await import('./lazy')
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x.js'))).toBe(true)
    expect(isChunkLoadError(new Error('інша помилка'))).toBe(false)
    await expect(loadChunk(async () => 5)).resolves.toBe(5)
    await expect(loadChunk(async () => { throw new Error('інша помилка') })).rejects.toThrow('інша помилка')
  })
})

describe('groupByRoom (шаблон «на ніч»)', () => {
  it('групує за кімнатами в порядку списку й нумерує всередині кімнати', async () => {
    const { groupByRoom } = await import('./templating')
    const g = groupByRoom([
      { room: '500', full_name: 'А' },
      { room: '500', full_name: 'Б' },
      { room: '502', full_name: 'В' },
    ])
    expect(g.map((x) => [x.room, x.count])).toEqual([['500', '2'], ['502', '1']])
    expect(g[0].students.map((s) => s.index)).toEqual(['1', '2'])
  })
})

describe('splitRooms (2 колонки)', () => {
  it('ділить по порядку на рівні за висотою колонки; кімната не розривається', async () => {
    const { groupByRoom, splitRooms } = await import('./templating')
    const mk = (room: string, n: number) => Array.from({ length: n }, () => ({ room }))
    const rooms = groupByRoom([...mk('500', 5), ...mk('501', 5), ...mk('502', 5), ...mk('503', 5)])
    const { left, right } = splitRooms(rooms)
    expect(left.map((r) => r.room)).toEqual(['500', '501'])
    expect(right.map((r) => r.room)).toEqual(['502', '503'])
    const one = splitRooms(groupByRoom(mk('500', 4)))
    expect(one.left.map((r) => r.room)).toEqual(['500'])
    expect(one.right).toEqual([])
  })
})

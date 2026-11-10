import { describe, expect, it } from 'vitest'
import { nextSortOrder, normProf, OTHER, professionChoice, stripBase, suggestProfessions } from './professions'

const list = ['Перукар (перукар-модельєр)', 'Верстатник широкого профілю']

describe('professionChoice', () => {
  it('значення зі списку (будь-який регістр/пробіли) → назва зі списку', () => {
    expect(professionChoice('  перукар (перукар-модельєр) ', list)).toBe('Перукар (перукар-модельєр)')
  })
  it('інше значення → «Інша»; порожнє → нічого', () => {
    expect(professionChoice('Кухар', list)).toBe(OTHER)
    expect(professionChoice('', list)).toBe('')
    expect(professionChoice('   ', list)).toBe('')
    expect(professionChoice('Кухар', [])).toBe(OTHER)
  })
})

describe('освітня база в назві', () => {
  const official = [
    'Верстатник широкого профілю — на базі 9 класів',
    'Перукар (перукар-модельєр) — на базі 11 класів',
    'Слюсар. Водій (категорія В) — на базі 9 класів',
    'Слюсар. Водій (категорія В) — на базі 11 класів',
    'Оператор комп’ютерної верстки — на базі 9 класів',
  ]
  it('stripBase прибирає суфікс', () => {
    expect(stripBase('Верстатник широкого профілю — на базі 9 класів')).toBe('Верстатник широкого профілю')
    expect(stripBase('Верстатник')).toBe('Верстатник')
  })
  it('стара відповідь без бази: одна відповідна позиція → обирається; неоднозначна → «Інша»', () => {
    expect(professionChoice('Верстатник широкого профілю', official)).toBe('Верстатник широкого профілю — на базі 9 класів')
    expect(professionChoice('Перукар (перукар-модельєр).', official)).toBe('Перукар (перукар-модельєр) — на базі 11 класів')
    expect(professionChoice('Слюсар. Водій (категорія В)', official)).toBe(OTHER)
  })
  it('точний збіг з базою та різні апострофи', () => {
    expect(professionChoice('Верстатник широкого профілю — на базі 9 класів', official)).toBe('Верстатник широкого профілю — на базі 9 класів')
    expect(professionChoice("Оператор комп'ютерної верстки", official)).toBe('Оператор комп’ютерної верстки — на базі 9 класів')
  })
  it('старі варіанти, що відповідають позиції без бази, не потрапляють у «немає в списку»', () => {
    const s = suggestProfessions([{ profession: 'Верстатник широкого профілю' }, { profession: 'Кухар' }], official)
    expect(s.map((x) => x.name)).toEqual(['Кухар'])
  })
})

describe('suggestProfessions', () => {
  const rows = [
    { profession: 'Перукар (перукар-модельєр)' },
    { profession: 'Перукар(перукар-модельєр)' }, { profession: 'Перукар(перукар-модельєр)' },
    { profession: 'автоелектрик' }, { profession: 'Автоелектрик' }, { profession: 'Автоелектрик' },
    { profession: 'Верстатник' }, { profession: null }, { profession: '  ' },
  ]
  it('відсікає те, що вже в переліку; рахує варіанти разом; найчастіший варіант — як назва', () => {
    const s = suggestProfessions(rows, list)
    expect(s.map((x) => x.name)).toEqual(['Автоелектрик', 'Перукар(перукар-модельєр)', 'Верстатник'])
    expect(s[0]).toEqual({ name: 'Автоелектрик', count: 3 })
    expect(s.find((x) => x.name === 'Верстатник')?.count).toBe(1)
  })
  it('ліміт і порожній ввід', () => {
    expect(suggestProfessions(rows, list, 1)).toHaveLength(1)
    expect(suggestProfessions([], list)).toEqual([])
  })
})

describe('helpers', () => {
  it('normProf і nextSortOrder', () => {
    expect(normProf('  Слюсар   З Ремонту ')).toBe('слюсар з ремонту')
    expect(nextSortOrder([])).toBe(10)
    expect(nextSortOrder([{ sort_order: 30 }, { sort_order: 90 }])).toBe(100)
  })
})

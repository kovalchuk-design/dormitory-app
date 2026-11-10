import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../../lib/studentsList'
import { activeFilterCount, isFiltersDirty, placementParts } from './logic'

const join = (r: Parameters<typeof placementParts>[0]) => placementParts(r).map((p) => p.text).join(' · ')

describe('placementParts', () => {
  it('поверх · кімната · група', () => {
    expect(join({ floor: 4, room: '412', group_number: '21' })).toBe('4 пов. · к. 412 · гр. 21')
  })
  it('без групи', () => expect(join({ floor: 2, room: '205', group_number: null })).toBe('2 пов. · к. 205'))
  it('без кімнати — виділено', () => {
    const p = placementParts({ floor: null, room: null, group_number: '21' })
    expect(p.map((x) => x.text).join(' · ')).toBe('без кімнати · гр. 21')
    expect(p[0].unplaced).toBe(true)
    expect(p[1].unplaced).toBe(false)
  })
})

describe('activeFilterCount', () => {
  it('за замовчуванням 0, пошук не рахується', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, query: 'іван' })).toBe(0)
    expect(isFiltersDirty({ ...DEFAULT_FILTERS, query: 'іван' })).toBe(true)
    expect(isFiltersDirty(DEFAULT_FILTERS)).toBe(false)
  })
  it('рахує групи, а не окремі значення', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, floors: [2, 3], social: ['orphan', 'vpo'], unplacedOnly: true })).toBe(3)
  })
})

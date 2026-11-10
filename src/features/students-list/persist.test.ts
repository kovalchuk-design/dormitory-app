import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../../lib/studentsList'
import { loadFilters, saveFilters } from './persist'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
  }
})

describe('persist фільтрів', () => {
  it('порожньо → типові', () => expect(loadFilters()).toEqual(DEFAULT_FILTERS))
  it('зберігає й відновлює', () => {
    saveFilters({ ...DEFAULT_FILTERS, query: 'іван', floors: [3] })
    expect(loadFilters()).toMatchObject({ query: 'іван', floors: [3] })
  })
  it('пошкоджені дані не ламають', () => {
    store.set('students-filters-v1', '{"floors":"x","social":[1]}')
    expect(loadFilters().floors).toEqual([])
    store.set('students-filters-v1', 'не json')
    expect(loadFilters()).toEqual(DEFAULT_FILTERS)
  })
})

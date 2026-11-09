import { describe, expect, it } from 'vitest'
import { isPartialDate, joinDateParts, splitIsoDate, yearOptions } from './dateParts'

describe('dateParts', () => {
  it('ISO ↔ день/місяць/рік', () => {
    expect(splitIsoDate('2008-07-05')).toEqual({ y: '2008', m: '7', d: '5' })
    expect(joinDateParts({ y: '2008', m: '7', d: '5' })).toBe('2008-07-05')
    expect(joinDateParts({ y: '2010', m: '12', d: '31' })).toBe('2010-12-31')
    expect(splitIsoDate('')).toEqual({ d: '', m: '', y: '' })
    expect(splitIsoDate('31.07.2008')).toEqual({ d: '', m: '', y: '' })
  })
  it('поки обрано не все — порожньо, а «частково» відрізняється від «порожньо»', () => {
    expect(joinDateParts({ d: '5', m: '', y: '2008' })).toBe('')
    expect(isPartialDate({ d: '5', m: '', y: '2008' })).toBe(true)
    expect(isPartialDate({ d: '', m: '', y: '' })).toBe(false)
    expect(isPartialDate({ d: '5', m: '7', y: '2008' })).toBe(false)
  })
  it('роки: від найновішого; рік наявного значення додається, навіть якщо поза діапазоном', () => {
    expect(yearOptions(2007, 2010)).toEqual([2010, 2009, 2008, 2007])
    expect(yearOptions(2007, 2010, '1999')).toEqual([2010, 2009, 2008, 2007, 1999])
    expect(yearOptions(2007, 2010, '2008')).toEqual([2010, 2009, 2008, 2007])
  })
})

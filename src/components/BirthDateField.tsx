import { useState } from 'react'
import { isPartialDate, joinDateParts, MONTHS, splitIsoDate, yearOptions, type DateParts } from '../lib/dateParts'
import { Select } from './ui/Select'

interface Props {
  /** id першого поля (до нього прив'язується <label>) */
  id: string
  /** name першого поля — для переведення фокуса на помилку */
  name: string
  /** YYYY-MM-DD або порожньо */
  value: string
  /** iso — повна дата або ''; incomplete — обрано лише частину (день/місяць/рік) */
  onChange: (iso: string, incomplete: boolean) => void
  minYear: number
  maxYear: number
  invalid?: boolean
  describedBy?: string
}

/**
 * Дата народження трьома виборами: день, місяць, рік. На телефоні кожен відкриває зручний системний список
 * (замість важкого календаря з прокруткою на десятки років).
 */
export function BirthDateField({ id, name, value, onChange, minYear, maxYear, invalid, describedBy }: Props) {
  const [parts, setParts] = useState<DateParts>(() => splitIsoDate(value))
  const set = (k: keyof DateParts, v: string) => {
    const next = { ...parts, [k]: v }
    setParts(next)
    onChange(joinDateParts(next), isPartialDate(next))
  }
  const common = { 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy } as const
  return (
    <div className="date-parts" role="group" aria-label="Дата народження">
      <Select id={id} name={name} aria-label="День" value={parts.d} onChange={(e) => set('d', e.target.value)} {...common}>
        <option value="">День</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </Select>
      <Select name={`${name}_month`} aria-label="Місяць" value={parts.m} onChange={(e) => set('m', e.target.value)} {...common}>
        <option value="">Місяць</option>
        {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
      </Select>
      <Select name={`${name}_year`} aria-label="Рік" value={parts.y} onChange={(e) => set('y', e.target.value)} {...common}>
        <option value="">Рік</option>
        {yearOptions(minYear, maxYear, parts.y).map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
    </div>
  )
}

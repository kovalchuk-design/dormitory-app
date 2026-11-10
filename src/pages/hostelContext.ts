import { createContext } from 'react'
import type { StudentRow } from '../lib/studentsList'

/** Список студентів реєструє тут функцію, що повертає поточні (відфільтровані) рядки — для кнопки «Експорт CSV» у шапці. */
export const HostelExportRegistry = createContext<((fn: (() => StudentRow[]) | null) => void) | null>(null)

/** Прапорець діалогу «Нова кімната»: кнопка «+ Кімната» в шапці «Гуртожитку» вмикає його, діалог показує вид «Кімнати». */
export const HostelNewRoom = createContext<{ creating: boolean; setCreating: (v: boolean) => void }>({ creating: false, setCreating: () => {} })

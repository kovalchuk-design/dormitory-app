import { createContext } from 'react'

/** Прапорець діалогу «Нова кімната»: кнопка «+ Кімната» в шапці «Гуртожитку» вмикає його, діалог показує вид «Кімнати». */
export const HostelNewRoom = createContext<{ creating: boolean; setCreating: (v: boolean) => void }>({ creating: false, setCreating: () => {} })

/** Картка учня в шухляді: відкривається з обох видів «Гуртожитку» (клік по імені). */
export const HostelStudentCard = createContext<{ openId: string | null; open: (id: string) => void }>({ openId: null, open: () => {} })

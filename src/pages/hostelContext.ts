import { createContext } from 'react'

/** Вузол у шапці сторінки «Гуртожиток», куди вид (кімнати/студенти) виносить свої кнопки. */
export const HostelActionsSlot = createContext<HTMLElement | null>(null)

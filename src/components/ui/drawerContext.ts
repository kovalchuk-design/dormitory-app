import { createContext } from 'react'

/** DOM-вузол у шапці шухляди, куди вміст може «підняти» свій компактний заголовок (через портал). */
export const DrawerTitleSlot = createContext<HTMLElement | null>(null)

import type { ReactNode } from 'react'
import { RoundCtx } from './roundState'
import { useNightRoster } from './useNightRoster'

/** Підключає відмітки вечора лише в режимі «Обхід» (поза ним запитів і підписки немає). */
export function RoundProvider({ children }: { children: ReactNode }) {
  const state = useNightRoster()
  return <RoundCtx.Provider value={state}>{children}</RoundCtx.Provider>
}

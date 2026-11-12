import { createContext, useContext } from 'react'
import type { useNightRoster } from './useNightRoster'

export type RoundState = ReturnType<typeof useNightRoster>
export const RoundCtx = createContext<RoundState | null>(null)

export function useRound(): RoundState | null {
  return useContext(RoundCtx)
}

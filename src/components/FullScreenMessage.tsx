import type { ReactNode } from 'react'

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="fullscreen">
      <div className="card">{children}</div>
    </div>
  )
}

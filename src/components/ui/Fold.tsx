import type { ReactNode } from 'react'

/** Розділ, що згортається/розгортається (details). Заголовок — у summary; за замовчуванням згорнутий, якщо не задано `defaultOpen`. */
export function Fold({ id, title, defaultOpen = false, children }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="fold-sec" open={defaultOpen}>
      <summary id={id}>{title}</summary>
      <div className="fold-body" aria-labelledby={id}>{children}</div>
    </details>
  )
}

import type { ReactNode } from 'react'

/**
 * Розділ у сірій плашці. Згортається/розгортається (details; за замовчуванням згорнутий, якщо не задано `defaultOpen`),
 * а з `always` — завжди відкритий, без стрілки.
 */
export function Fold({ id, title, defaultOpen = false, always = false, children }: {
  id: string; title: string; defaultOpen?: boolean; always?: boolean; children: ReactNode
}) {
  if (always) {
    return (
      <section className="fold-sec fold-static" aria-labelledby={id}>
        <h2 id={id} className="fold-title">{title}</h2>
        <div className="fold-body">{children}</div>
      </section>
    )
  }
  return (
    <details className="fold-sec" open={defaultOpen}>
      <summary id={id}>{title}</summary>
      <div className="fold-body" aria-labelledby={id}>{children}</div>
    </details>
  )
}

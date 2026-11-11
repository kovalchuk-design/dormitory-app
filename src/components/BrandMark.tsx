/**
 * Знак застосунку — ті самі символи, що у favicon (public/favicon.svg), без фонового квадрата:
 * бічна панель завжди чорна, тож знак стоїть прямо на ній.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="118 132 292 288" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-fg" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#A9ADB3" />
        </linearGradient>
      </defs>
      <path d="M158 380 V238 a66 66 0 0 1 66-66 H362" fill="none" stroke="url(#brand-fg)" strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="362" cy="354" r="40" fill="url(#brand-fg)" />
    </svg>
  )
}

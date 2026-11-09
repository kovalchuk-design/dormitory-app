import { telHref } from '../lib/format'

/** Клікабельний номер (tel:) — для екстрених дзвінків. */
export function PhoneLink({ phone, label }: { phone: string | null | undefined; label?: string }) {
  const href = telHref(phone)
  if (!phone) return <span className="muted">—</span>
  if (!href) return <span>{phone}</span>
  return (
    <a className="phone" href={href} aria-label={label ? `Подзвонити: ${label} ${phone}` : `Подзвонити ${phone}`}>
      {phone}
    </a>
  )
}

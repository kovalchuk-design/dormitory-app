/**
 * Базова адреса сайту береться з поточної адреси сторінки (без `#…`), тож при зміні домена чи шляху
 * посилання для учнів змінюються самі. За потреби можна задати вручну змінною `VITE_PUBLIC_SITE_URL`.
 */
export function siteBaseFrom(loc: { origin: string; pathname: string }, override?: string): string {
  const raw = override?.trim() || `${loc.origin}${loc.pathname.replace(/index\.html$/, '')}`
  return raw.replace(/\/?$/, '/')
}

export function getSiteBase(): string {
  return siteBaseFrom(window.location, import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)
}

export function buildFormLink(token: string, base: string = getSiteBase()): string {
  return `${base.replace(/\/?$/, '/')}#/form/${token}`
}

export function isLinkActive(req: { used_at: string | null; expires_at: string }, now: Date = new Date()): boolean {
  return req.used_at == null && new Date(req.expires_at).getTime() > now.getTime()
}

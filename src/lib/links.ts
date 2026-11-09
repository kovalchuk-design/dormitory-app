/** Публічна адреса сайту (GitHub Pages). Посилання на анкету завжди будуються від неї. */
export const PUBLIC_SITE_URL = 'https://kovalchuk-design.github.io/dormitory-app/'

export function buildFormLink(token: string, base: string = PUBLIC_SITE_URL): string {
  return `${base.replace(/\/?$/, '/')}#/form/${token}`
}

export function isLinkActive(req: { used_at: string | null; expires_at: string }, now: Date = new Date()): boolean {
  return req.used_at == null && new Date(req.expires_at).getTime() > now.getTime()
}

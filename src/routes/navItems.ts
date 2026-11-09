import type { Role } from '../auth/roles'

export interface NavItem {
  to: string
  label: string
  /** Ролі, яким доступний пункт. Якщо не задано — усім. */
  roles?: Role[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Головна' },
  { to: '/students', label: 'Студенти' },
  { to: '/rooms', label: 'Кімнати' },
  { to: '/documents', label: 'Документи' },
  { to: '/events', label: 'Івенти' },
  { to: '/calendar', label: 'Календар' },
  { to: '/admin', label: 'Адміністрування', roles: ['admin'] },
]

export function navItemsForRole(role: Role | null | undefined, items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((i) => !i.roles || (role != null && i.roles.includes(role)))
}

export function canAccess(role: Role | null | undefined, path: string): boolean {
  const item = NAV_ITEMS.find((i) => i.to === path)
  return !item || navItemsForRole(role, [item]).length > 0
}

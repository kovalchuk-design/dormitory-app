import type { Role } from '../auth/roles'

export interface NavItem {
  to: string
  label: string
  /** Ролі, яким доступний пункт. Якщо не задано — усім. */
  roles?: Role[]
  /** Значок-лічильник біля пункту (дані дає Layout). */
  badge?: 'pending' | 'unmatched' | 'forms'
  /** Пункт видно, але відкрити не можна (розділ ще не розпочато). */
  disabled?: boolean
}

/**
 * На цьому етапі вихователі (educator, зокрема адмін у PIN-сесії) бачать лише «Гуртожиток» і «Документи».
 * Решту розділів відкрито адміністратору (і поки що staff_readonly — «Івенти», «Календар»).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/hostel', label: 'Гуртожиток' },
  { to: '/forms', label: 'Анкети', roles: ['admin'], badge: 'forms' }, // вкладки: «Збір анкет» і «Оновлення даних»
  { to: '/documents', label: 'Документи' },
  { to: '/events', label: 'Івенти', roles: ['admin', 'staff_readonly'], disabled: true },
  { to: '/calendar', label: 'Календар', roles: ['admin', 'staff_readonly'], disabled: true },
  { to: '/admin', label: 'Адміністрування', roles: ['admin'] },
]

export function navItemsForRole(role: Role | null | undefined, items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((i) => !i.roles || (role != null && i.roles.includes(role)))
}

export function canAccess(role: Role | null | undefined, path: string): boolean {
  const item = NAV_ITEMS.find((i) => i.to === path)
  return !item || navItemsForRole(role, [item]).length > 0
}

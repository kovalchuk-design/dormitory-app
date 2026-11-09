export type Role = 'admin' | 'educator' | 'staff_readonly'

export interface Profile {
  id: string
  full_name: string
  role: Role
  floor: number | null
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Адміністратор',
  educator: 'Вихователь',
  staff_readonly: 'Перегляд',
}

export function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'educator' || value === 'staff_readonly'
}

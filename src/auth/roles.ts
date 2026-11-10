export type Role = 'admin' | 'educator' | 'staff_readonly'

export interface Profile {
  id: string
  full_name: string
  role: Role
  floor: number | null
  /** true → користувач має спершу змінити тимчасовий пароль */
  mustChangePassword: boolean
  /** сесія створена входом за PIN: навіть для адмін-акаунта діють права вихователя */
  pinSession: boolean
  /** акаунт має роль admin (у PIN-сесії role показує «educator») */
  adminAccount: boolean
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Адміністратор',
  educator: 'Вихователь',
  staff_readonly: 'Перегляд',
}

export function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'educator' || value === 'staff_readonly'
}

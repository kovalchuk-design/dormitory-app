import type { Role } from '../../auth/roles'
import type { DocumentRow } from './types'

/** Дзеркало RLS: завантажують admin та educator. */
export const canUpload = (role: Role | null | undefined) => role === 'admin' || role === 'educator'

/** Дзеркало RLS documents_delete: admin або educator-автор. */
export function canDeleteDocument(
  user: { id: string; role: Role } | null | undefined,
  doc: Pick<DocumentRow, 'author_id'>,
): boolean {
  if (!user) return false
  return user.role === 'admin' || (user.role === 'educator' && doc.author_id === user.id)
}

/** Дзеркало RLS document_templates_*: admin завжди; educator — лише коли перемикач увімкнено. */
export function canEditTemplates(role: Role | null | undefined, educatorsCanEdit: boolean): boolean {
  return role === 'admin' || (role === 'educator' && educatorsCanEdit)
}

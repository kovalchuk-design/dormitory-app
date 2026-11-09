import { STATUS_LABELS, type StudentStatus } from '../lib/format'

export function StatusBadge({ status }: { status: StudentStatus }) {
  return <span className={`tag tag-${status}`}>{STATUS_LABELS[status]}</span>
}

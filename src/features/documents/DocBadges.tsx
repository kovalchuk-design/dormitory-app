import { fileTypeOf } from './filters'
import type { Lookups } from './lookups'
import type { DocumentRow } from './types'

export function DocBadges({ doc, lookups, showCategory = true }: { doc: DocumentRow; lookups: Lookups; showCategory?: boolean }) {
  const year = doc.academic_year_id ? lookups.years.get(doc.academic_year_id)?.name : null
  const author = doc.author_id ? lookups.authors.get(doc.author_id)?.full_name : null
  const type = fileTypeOf(doc)
  return (
    <div className="badges">
      {year && <span className="badge badge-year" title="Навчальний рік">{year}</span>}
      <span className="badge badge-author" title="Автор">{author ?? 'автор невідомий'}</span>
      <span className={`badge badge-type badge-${type}`}>{type === 'other' ? 'файл' : type.toUpperCase()}</span>
      {showCategory && doc.category && <span className="badge">{doc.category}</span>}
      {showCategory && doc.topic && <span className="badge">{doc.topic}</span>}
      {doc.tags.map((t) => (
        <span key={t} className="badge badge-tag">#{t}</span>
      ))}
    </div>
  )
}

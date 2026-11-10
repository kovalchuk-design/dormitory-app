import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useQueueCounts } from '../lib/pending'
import { ApprovalsPage } from './ApprovalsPage'
import { CollectPage } from './CollectPage'

/** «Анкети»: одна сторінка з двома вкладками — «Збір анкет» і «Оновлення даних». Лічильники на вкладках — що чекає на увагу. */
export function FormsPage() {
  const { view } = useParams<{ view: string }>()
  const counts = useQueueCounts(true)
  if (view !== 'collect' && view !== 'updates') return <Navigate to="/forms/collect" replace />
  const count = (n: number, label: string) => n > 0 && <span className="count">{n}<span className="sr-only"> {label}</span></span>
  return (
    <section className={`forms${view === 'updates' ? ' fill-page' : ''}`}>
      <div className="hostel-head">
        <h1>Анкети</h1>
        <nav className="view-switch" aria-label="Вкладки">
          <NavLink to="/forms/collect" replace>Збір анкет{count(counts.unmatched, 'не зіставлено з учнем')}</NavLink>
          <NavLink to="/forms/updates" replace>Оновлення даних{count(counts.pending, 'очікують підтвердження')}</NavLink>
        </nav>
      </div>
      <div className="forms-view">{view === 'collect' ? <CollectPage /> : <ApprovalsPage />}</div>
    </section>
  )
}

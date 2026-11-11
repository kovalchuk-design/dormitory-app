import { useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useQueueCounts } from '../lib/pending'
import { ApprovalsPage } from './ApprovalsPage'
import { SettingsTab, UnmatchedTab } from './CollectPage'

type View = 'unmatched' | 'updates' | 'settings'
const VIEWS: View[] = ['unmatched', 'updates', 'settings']

/** «Анкети»: три вкладки — «Не зіставлені», «Оновлення даних», «Налаштування». Лічильники на вкладках — що чекає на увагу. */
export function FormsPage() {
  const { view } = useParams<{ view: string }>()
  const counts = useQueueCounts(true)
  const [onlyChanged, setOnlyChanged] = useState(true)
  if (!VIEWS.includes(view as View)) return <Navigate to="/forms/unmatched" replace />
  const count = (n: number, label: string) => n > 0 && <span className="count">{n}<span className="sr-only"> {label}</span></span>
  return (
    <section className="forms fill-page">
      <div className="hostel-head">
        <h1>Анкети</h1>
        <nav className="view-switch" aria-label="Вкладки">
          <NavLink to="/forms/unmatched" replace>Не зіставлені{count(counts.unmatched, 'не зіставлено з учнем')}</NavLink>
          <NavLink to="/forms/updates" replace>Оновлення даних{count(counts.pending, 'очікують підтвердження')}</NavLink>
          <NavLink to="/forms/settings" replace>Налаштування</NavLink>
        </nav>
        {view === 'updates' && (
          <label className="check forms-aside"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Лише змінені поля</label>
        )}
      </div>
      <div className="forms-view">
        {view === 'unmatched' ? <UnmatchedTab /> : view === 'updates' ? <ApprovalsPage onlyChanged={onlyChanged} /> : <SettingsTab />}
      </div>
    </section>
  )
}

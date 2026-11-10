import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { ROLE_LABELS, isRole } from '../../auth/roles'
import { useLoad } from '../../lib/useLoad'
import { AdminApiError, resetPassword, updateUser } from './api'
import { ConfirmDialog, PasswordResultDialog } from './Dialogs'
import { UserFormDialog } from './UserFormDialog'
import { PinDialog } from './PinDialog'
import { EMPTY_FILTERS, errorText, filterUsers, lastSeenLabel, sortUsers, type AdminUser, type UserFilters } from './logic'
import { listUsers } from './api'
import './adminUsers.css'

type Action =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'toggle'; user: AdminUser }
  | { kind: 'reset'; user: AdminUser }
  | { kind: 'revoke'; user: AdminUser }
  | { kind: 'secret'; user: AdminUser; password: string }
  | { kind: 'pin'; user: AdminUser }

export function AdminUsersPage() {
  const { profile } = useAuth()
  const selfId = profile?.id ?? ''
  const { data, error, loading, reload } = useLoad(listUsers, 'users')
  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS)
  const [action, setAction] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visible = useMemo(() => sortUsers(filterUsers(data ?? [], filters)), [data, filters])
  const close = () => { setAction(null); setActionError(null) }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : errorText('unavailable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel au" aria-labelledby="au-h">
      <div className="au-head">
        <h2 id="au-h">Користувачі</h2>
        <div className="au-head-actions">
          <button type="button" className="secondary" onClick={reload} disabled={loading}>Оновити</button>
          <button type="button" onClick={() => setAction({ kind: 'create' })}>Додати користувача</button>
        </div>
      </div>

      <div className="au-filters">
        <input
          type="search" placeholder="Пошук за ПІБ або email" aria-label="Пошук користувачів"
          value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <select aria-label="Фільтр за роллю" value={filters.role} onChange={(e) => setFilters({ ...filters, role: isRole(e.target.value) ? e.target.value : '' })}>
          <option value="">Усі ролі</option>
          {(['admin', 'educator', 'staff_readonly'] as const).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select aria-label="Фільтр за статусом" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as UserFilters['status'] })}>
          <option value="">Усі статуси</option>
          <option value="active">Активні</option>
          <option value="inactive">Неактивні</option>
        </select>
      </div>

      {notice && <p role="status" className="au-notice">{notice}</p>}
      {actionError && !action && <p role="alert" className="error">{actionError}</p>}
      {loading && !data && <p className="muted">Завантаження…</p>}
      {error && <p role="alert" className="error">Не вдалося завантажити список користувачів. <button type="button" className="link" onClick={reload}>Спробувати ще раз</button></p>}
      {data && visible.length === 0 && <p className="muted">Нікого не знайдено.</p>}

      <ul className="au-list">
        {visible.map((u) => {
          const isSelf = u.id === selfId
          return (
            <li key={u.id} className={`au-card${u.is_active ? '' : ' off'}`}>
              <div className="au-main">
                <strong>{u.full_name || '(без імені)'}</strong>{isSelf && <span className="badge"> це ви</span>}
                <div className="muted au-email">{u.email ?? '—'}</div>
                <div className="badges">
                  <span className="badge badge-author">{ROLE_LABELS[u.role]}</span>
                  <span className="badge">{u.floor ? `Поверх ${u.floor}` : 'Поверх —'}</span>
                  <span className={`badge ${u.is_active ? 'badge-year' : 'badge-pdf'}`}>{u.is_active ? 'Активний' : 'Неактивний'}</span>
                  <span className={`badge ${u.pin_locked ? 'badge-pdf' : 'badge-tag'}`}>{u.pin_locked ? 'PIN заблоковано' : u.has_pin ? 'Є PIN' : 'Без PIN'}</span>
                  {u.must_change_password && <span className="badge badge-tag">Має змінити пароль</span>}
                </div>
                <div className="muted small">Остання активність: {lastSeenLabel(u.last_sign_in_at)}</div>
              </div>
              <div className="card-actions">
                <button type="button" className="secondary" onClick={() => setAction({ kind: 'edit', user: u })}>Редагувати</button>
                <button type="button" className="secondary" onClick={() => setAction({ kind: 'pin', user: u })}>{u.has_pin ? 'Змінити PIN' : 'Задати PIN'}</button>
                {u.pin_locked && (
                  <button type="button" onClick={() => void run(async () => { await updateUser({ user_id: u.id, unlock: true }); setNotice(`Вхід користувача ${u.full_name} розблоковано.`); reload() })} disabled={busy}>Розблокувати</button>
                )}
                {!isSelf && <button type="button" className="secondary" onClick={() => setAction({ kind: 'reset', user: u })}>Скинути пароль</button>}
                {!isSelf && <button type="button" className="secondary" onClick={() => setAction({ kind: 'revoke', user: u })}>Вийти з усіх пристроїв</button>}
                {!isSelf && (
                  <button type="button" className={u.is_active ? 'danger' : 'secondary'} onClick={() => setAction({ kind: 'toggle', user: u })}>
                    {u.is_active ? 'Деактивувати' : 'Активувати'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {(action?.kind === 'create' || action?.kind === 'edit') && (
        <UserFormDialog
          user={action.kind === 'edit' ? action.user : null}
          selfId={selfId} onClose={close} onDone={reload}
        />
      )}
      {action?.kind === 'toggle' && (
        <ConfirmDialog
          title={action.user.is_active ? 'Деактивувати користувача?' : 'Активувати користувача?'}
          confirmLabel={action.user.is_active ? 'Деактивувати' : 'Активувати'} danger={action.user.is_active}
          busy={busy} error={actionError} onClose={close}
          onConfirm={() => run(async () => {
            await updateUser({ user_id: action.user.id, is_active: !action.user.is_active })
            setNotice(action.user.is_active ? 'Користувача деактивовано, усі його сесії завершено.' : 'Користувача активовано.')
            reload(); close()
          })}
        >
          {action.user.is_active
            ? <p><strong>{action.user.full_name}</strong> втратить доступ до застосунку негайно. Історія та журнали збережуться — обліковий запис не видаляється.</p>
            : <p><strong>{action.user.full_name}</strong> знову зможе входити в застосунок.</p>}
        </ConfirmDialog>
      )}
      {action?.kind === 'reset' && (
        <ConfirmDialog
          title="Скинути пароль?" confirmLabel="Скинути пароль" danger busy={busy} error={actionError} onClose={close}
          onConfirm={() => run(async () => {
            const r = await resetPassword(action.user.id)
            reload(); setAction({ kind: 'secret', user: action.user, password: r.temporary_password })
          })}
        >
          <p>Для <strong>{action.user.full_name}</strong> буде створено новий тимчасовий пароль, а всі поточні сесії завершено. Старий пароль перестане діяти.</p>
        </ConfirmDialog>
      )}
      {action?.kind === 'revoke' && (
        <ConfirmDialog
          title="Завершити всі сесії?" confirmLabel="Завершити сесії" danger busy={busy} error={actionError} onClose={close}
          onConfirm={() => run(async () => {
            await updateUser({ user_id: action.user.id, revoke_sessions: true })
            setNotice(`Сесії користувача ${action.user.full_name} завершено.`); reload(); close()
          })}
        >
          <p><strong>{action.user.full_name}</strong> буде розлогінено на всіх пристроях. Пароль лишається чинним.</p>
        </ConfirmDialog>
      )}
      {action?.kind === 'pin' && <PinDialog user={action.user} onClose={close} onDone={reload} />}
      {action?.kind === 'secret' && (
        <PasswordResultDialog title="Новий тимчасовий пароль" email={action.user.email} password={action.password} onClose={close}
          note="Передайте пароль працівнику безпечним каналом. Під час наступного входу застосунок попросить змінити його." />
      )}
    </section>
  )
}

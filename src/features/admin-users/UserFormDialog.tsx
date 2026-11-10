import { useState, type FormEvent } from 'react'
import { ROLE_LABELS } from '../../auth/roles'
import { ROLES, validateCreateUser, validateUpdateUser, type AppRole, type CreateMode } from '../../../supabase/functions/_shared/adminUsers.ts'
import { AdminApiError, createUser, updateUser } from './api'
import { errorText, type AdminUser } from './logic'
import { Dialog, PasswordResultDialog } from './Dialogs'

const FLOORS = [2, 3, 4, 5]

/** Створення (user = null) або редагування користувача. */
export function UserFormDialog({ user, selfId, onClose, onDone }: {
  user: AdminUser | null; selfId: string; onClose: () => void; onDone: () => void
}) {
  const editing = user !== null
  const isSelf = user?.id === selfId
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<AppRole>(user?.role ?? 'educator')
  const [floor, setFloor] = useState<string>(user?.floor != null ? String(user.floor) : '')
  const [active, setActive] = useState(user?.is_active ?? true)
  const [mode, setMode] = useState<CreateMode>('password')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [invited, setInvited] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    const floorValue = floor === '' ? null : Number(floor)
    setBusy(true)
    try {
      if (editing && user) {
        const v = validateUpdateUser({ user_id: user.id, full_name: fullName, role, floor: floorValue, is_active: active })
        if (!v.ok) return setFieldErrors(v.errors)
        await updateUser(v.value)
        onDone()
        onClose()
      } else {
        const v = validateCreateUser({ full_name: fullName, email, role, floor: floorValue, is_active: active, mode })
        if (!v.ok) return setFieldErrors(v.errors)
        const r = await createUser(v.value)
        onDone()
        if (r.temporary_password) setCreated({ email: v.value.email, password: r.temporary_password })
        else setInvited(v.value.email)
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
        if (err.fields) setFieldErrors(err.fields)
      } else setError(errorText('unavailable'))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return <PasswordResultDialog title="Користувача створено" email={created.email} password={created.password} onClose={onClose} />
  }
  if (invited) {
    return (
      <Dialog title="Запрошення надіслано" onClose={onClose} footer={<button type="button" onClick={onClose}>Готово</button>}>
        <p>Лист-запрошення надіслано на <strong>{invited}</strong>.</p>
        <p className="muted small">Якщо лист не приходить за кілька хвилин — перевірте «Спам». Вбудована пошта Supabase має суворі ліміти; тоді створіть користувача з тимчасовим паролем або скористайтеся «Скинути пароль».</p>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={editing ? 'Редагувати користувача' : 'Додати користувача'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" form="au-user-form" disabled={busy}>
            {busy ? 'Зачекайте…' : editing ? 'Зберегти' : mode === 'invite' ? 'Надіслати запрошення' : 'Створити'}
          </button>
        </>
      }
    >
      <form id="au-user-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="au-name">ПІБ</label>
          <input id="au-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" maxLength={120} />
          {fieldErrors.full_name && <span className="field-error">{fieldErrors.full_name}</span>}
        </div>
        <div className="field">
          <label htmlFor="au-email">Email</label>
          <input id="au-email" type="email" value={email ?? ''} onChange={(e) => setEmail(e.target.value)} disabled={editing} autoComplete="off" />
          {editing && <span className="muted small">Email змінити не можна.</span>}
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="au-role">Роль</label>
          <select id="au-role" value={role} onChange={(e) => setRole(e.target.value as AppRole)} disabled={isSelf}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {isSelf && <span className="muted small">Власну роль змінити не можна.</span>}
          {fieldErrors.role && <span className="field-error">{fieldErrors.role}</span>}
        </div>
        <div className="field">
          <label htmlFor="au-floor">Поверх (довідково)</label>
          <select id="au-floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
            <option value="">—</option>
            {FLOORS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className="muted small">Поверх не обмежує доступ: вихователі на зміні відповідають за всі поверхи.</span>
          {fieldErrors.floor && <span className="field-error">{fieldErrors.floor}</span>}
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={isSelf} />
          Обліковий запис активний
        </label>
        {!editing && (
          <fieldset className="au-modes">
            <legend>Як передати доступ</legend>
            <label>
              <input type="radio" name="au-mode" checked={mode === 'password'} onChange={() => setMode('password')} />
              Тимчасовий пароль (рекомендовано) — буде показано один раз
            </label>
            <label>
              <input type="radio" name="au-mode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
              Запрошення на email
            </label>
            {mode === 'invite' && (
              <p className="muted small">Увага: вбудована пошта Supabase має суворі ліміти (лише кілька листів на годину) і може бути недоступна. Якщо лист не прийшов — створіть користувача з тимчасовим паролем.</p>
            )}
          </fieldset>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </form>
    </Dialog>
  )
}

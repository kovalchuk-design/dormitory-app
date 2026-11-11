import { useAuth } from '../../auth/useAuth'
import { usePasswordChange } from './usePasswordChange'
import './adminUsers.css'

/** Обов'язковий екран «Створіть новий пароль» (після входу з тимчасовим паролем). Звичайна зміна пароля — у попапі меню акаунта. */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { signOut } = useAuth()
  const f = usePasswordChange()
  const body = (
    <form className={forced ? 'card' : 'panel cp-card'} onSubmit={f.submit}>
      <h1>{forced ? 'Створіть новий пароль' : 'Змінити пароль'}</h1>
      {forced && <p className="muted">Ви увійшли з тимчасовим паролем. Щоб продовжити, задайте власний пароль (щонайменше 10 символів).</p>}
      <label>
        Новий пароль
        <input type="password" autoComplete="new-password" value={f.pw} onChange={(e) => f.setPw(e.target.value)} />
      </label>
      <label>
        Повторіть пароль
        <input type="password" autoComplete="new-password" value={f.pw2} onChange={(e) => f.setPw2(e.target.value)} />
      </label>
      {!forced && <p className="muted small">Щонайменше 10 символів.</p>}
      {f.error && <p role="alert" className="error">{f.error}</p>}
      {f.done && !forced && <p role="status">Пароль змінено.</p>}
      <button type="submit" disabled={f.busy}>{f.busy ? 'Збереження…' : 'Зберегти пароль'}</button>
      {forced && <button type="button" className="secondary" onClick={() => void signOut()}>Вийти</button>}
    </form>
  )
  return forced ? <div className="fullscreen">{body}</div> : <section>{body}</section>
}

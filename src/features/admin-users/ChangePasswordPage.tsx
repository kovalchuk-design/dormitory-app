import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import { checkPasswordPolicy } from '../../../supabase/functions/_shared/adminUsers.ts'
import './adminUsers.css'

/** «Змінити пароль»: доступно кожному; `forced` — обов'язковий екран перед доступом до застосунку. */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { reloadProfile, signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const policy = checkPasswordPolicy(pw)
    if (policy) return setError(policy)
    if (pw !== pw2) return setError('Паролі не збігаються')
    setBusy(true)
    const { error: upErr } = await supabase.auth.updateUser({ password: pw })
    if (upErr) {
      setBusy(false)
      return setError(
        /same|different/i.test(upErr.message) ? 'Новий пароль має відрізнятися від поточного'
          : /weak|short|least/i.test(upErr.message) ? 'Пароль занадто простий або короткий'
          : 'Не вдалося змінити пароль. Спробуйте ще раз',
      )
    }
    const { error: rpcErr } = await supabase.rpc('complete_password_change')
    setBusy(false)
    if (rpcErr) return setError('Пароль змінено, але не вдалося зняти позначку. Оновіть сторінку')
    setPw(''); setPw2(''); setDone(true)
    await reloadProfile()
  }

  const body = (
    <form className={forced ? 'card' : 'panel cp-card'} onSubmit={submit}>
      <h1>{forced ? 'Створіть новий пароль' : 'Змінити пароль'}</h1>
      {forced && <p className="muted">Ви увійшли з тимчасовим паролем. Щоб продовжити, задайте власний пароль (щонайменше 10 символів).</p>}
      <label>
        Новий пароль
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <label>
        Повторіть пароль
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </label>
      {!forced && <p className="muted small">Щонайменше 10 символів.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {done && !forced && <p role="status">Пароль змінено.</p>}
      <button type="submit" disabled={busy}>{busy ? 'Збереження…' : 'Зберегти пароль'}</button>
      {forced && <button type="button" className="secondary" onClick={() => void signOut()}>Вийти</button>}
    </form>
  )
  return forced ? <div className="fullscreen">{body}</div> : <section>{body}</section>
}

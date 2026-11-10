import { useEffect, useState, type FormEvent } from 'react'
import { listLoginUsers, signInWithSecret, type LoginUser } from './api'
import { PIN_RE } from '../../../supabase/functions/_shared/pin.ts'

/** Вхід: вибір вихователя + PIN (4 цифри) або повний пароль (для адміністратора). */
export function PinLogin({ onUseEmail }: { onUseEmail: () => void }) {
  const [users, setUsers] = useState<LoginUser[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [userId, setUserId] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    listLoginUsers().then(
      (u) => alive && setUsers(u),
      () => alive && setLoadError(true),
    )
    return () => {
      alive = false
    }
  }, [attempt])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!userId || !secret) return
    setBusy(true)
    setError(null)
    const res = await signInWithSecret(userId, secret)
    setBusy(false)
    if (!res.ok) {
      setError(res.message)
      setSecret('')
    }
  }

  const isPin = PIN_RE.test(secret)
  return (
    <div className="fullscreen">
      <form className="card" onSubmit={onSubmit}>
        <p className="muted pl-brand">Гуртожиток</p>
        <h1>Вхід</h1>
        <label>
          Вибір вихователя
          <select value={userId} onChange={(e) => { setUserId(e.target.value); setError(null) }} disabled={!users} required>
            <option value="">{users ? '— оберіть —' : loadError ? 'Не вдалося завантажити' : 'Завантаження…'}</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.name || '(без імені)'}</option>)}
          </select>
        </label>
        {loadError && (
          <p role="alert" className="error">
            Не вдалося завантажити список. <button type="button" className="link" onClick={() => { setLoadError(false); setAttempt((n) => n + 1) }}>Спробувати ще раз</button>
          </p>
        )}
        {userId && (
          <label>
            PIN-код або пароль
            <input
              type="password" autoComplete="off" autoFocus required value={secret} maxLength={72}
              inputMode={/^\d*$/.test(secret) ? 'numeric' : 'text'}
              onChange={(e) => { setSecret(e.target.value); setError(null) }}
            />
            <span className="muted small">{isPin ? 'Вхід з PIN-кодом' : 'PIN — 4 цифри. Адміністратор для повних прав вводить пароль.'}</span>
          </label>
        )}
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={busy || !userId || !secret}>{busy ? 'Вхід…' : 'Увійти'}</button>
        <button type="button" className="link" onClick={onUseEmail}>Вхід за email і паролем</button>
      </form>
    </div>
  )
}

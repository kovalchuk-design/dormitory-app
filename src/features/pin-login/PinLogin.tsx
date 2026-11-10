import { useEffect, useState, type FormEvent } from 'react'
import { listLoginUsers, signInWithSecret, type LoginUser } from './api'
import { Select } from '../../components/ui/Select'

/** Вхід: вибір вихователя + PIN (4 цифри) або повний пароль (для адміністратора). */
export function PinLogin() {
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
      (u) => alive && setUsers([...u].sort((a, b) => a.name.localeCompare(b.name, 'uk', { numeric: true }))),
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

  return (
    <div className="fullscreen">
      <form className="card" onSubmit={onSubmit}>
        <p className="muted pl-brand">Гуртожиток</p>
        <h1>Вхід</h1>
        <div className="field">
          <label htmlFor="pl-user">Вибір вихователя</label>
          <Select id="pl-user" value={userId} onChange={(e) => { setUserId(e.target.value); setSecret(''); setError(null) }} disabled={!users}>
            <option value="">{users ? '— оберіть —' : loadError ? 'Не вдалося завантажити' : 'Завантаження…'}</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.name || '(без імені)'}</option>)}
          </Select>
        </div>
        {loadError && (
          <p role="alert" className="error">
            Не вдалося завантажити список. <button type="button" className="link" onClick={() => { setLoadError(false); setAttempt((n) => n + 1) }}>Спробувати ще раз</button>
          </p>
        )}
        <div className="field">
          <label htmlFor="pl-secret">Пароль</label>
          <input
            id="pl-secret" type="password" autoComplete="off" value={secret} maxLength={72} disabled={!userId}
            onChange={(e) => { setSecret(e.target.value); setError(null) }}
          />
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={busy || !userId || !secret}>{busy ? 'Вхід…' : 'Увійти'}</button>
      </form>
    </div>
  )
}

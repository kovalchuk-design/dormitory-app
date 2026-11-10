import { useState, type FormEvent } from 'react'
import { pinProblem } from '../../../supabase/functions/_shared/pin.ts'
import { AdminApiError, updateUser } from './api'
import { errorText, type AdminUser } from './logic'
import { Dialog, PinResultDialog } from './Dialogs'

/** Задати PIN: свій (4 цифри) або згенерувати; PIN завжди задає адміністратор. */
export function PinDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<string | null>(null)

  async function save(generate: boolean) {
    setError(null)
    if (!generate) {
      const problem = pinProblem(pin)
      if (problem) return setError(problem)
    }
    setBusy(true)
    try {
      const r = await updateUser(generate ? { user_id: user.id, generate_pin: true } : { user_id: user.id, pin })
      onDone()
      if (r.pin) setShown(r.pin)
      else onClose()
    } catch (e) {
      setError(e instanceof AdminApiError ? (e.fields?.pin ?? e.message) : errorText('unavailable'))
    } finally {
      setBusy(false)
    }
  }

  if (shown) return <PinResultDialog title="PIN створено" name={user.full_name} pin={shown} onClose={onClose} />
  return (
    <Dialog
      title={user.has_pin ? 'Змінити PIN' : 'Задати PIN'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="button" className="secondary" onClick={() => void save(true)} disabled={busy}>Згенерувати випадковий</button>
          <button type="submit" form="au-pin-form" disabled={busy || pin.length !== 4}>{busy ? 'Зачекайте…' : 'Зберегти PIN'}</button>
        </>
      }
    >
      <form id="au-pin-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(false) }}>
        <p>Користувач: <strong>{user.full_name}</strong></p>
        <div className="field">
          <label htmlFor="au-pin">Новий PIN (4 цифри)</label>
          <input id="au-pin" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <span className="muted small">Прості PIN (1111, 1234…) не приймаються. Усі поточні сесії користувача будуть завершені.</span>
        </div>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
    </Dialog>
  )
}

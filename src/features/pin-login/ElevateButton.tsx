import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../auth/useAuth'
import { signInWithSecret } from './api'

/** Діалог «Права адміністратора» — лише в PIN-сесії адмін-акаунта: повторний вхід повним паролем. Рендериться в body, щоб не обрізатися меню з transform/blur. */
export function ElevateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, reloadProfile } = useAuth()
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!open || !profile?.pinSession || !profile.adminAccount) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    const res = await signInWithSecret(profile.id, pw)
    if (!res.ok) {
      setBusy(false)
      return setError(res.message)
    }
    await reloadProfile()
    setBusy(false)
    setPw('')
    onClose()
  }

  const label = 'Права адміністратора'
  return createPortal(
        <div className="modal-backdrop au-backdrop" onClick={() => onClose()}>
          <form className="modal au-modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <header className="modal-head">
              <strong>{label}</strong>
              <button type="button" className="secondary" onClick={() => onClose()} aria-label="Закрити">✕</button>
            </header>
            <div className="modal-body">
              <p className="muted">Ви працюєте з правами вихователя (вхід за PIN). Щоб відкрити «Адміністрування», введіть повний пароль.</p>
              <div className="field">
                <label htmlFor="el-pw">Пароль адміністратора</label>
                <input id="el-pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              {error && <p role="alert" className="error">{error}</p>}
            </div>
            <footer className="modal-foot au-foot">
              <button type="button" className="secondary" onClick={() => onClose()} disabled={busy}>Скасувати</button>
              <button type="submit" disabled={busy || !pw}>{busy ? 'Перевірка…' : 'Підтвердити'}</button>
            </footer>
          </form>
        </div>
  , document.body)
}

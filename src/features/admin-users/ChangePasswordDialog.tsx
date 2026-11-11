import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePasswordChange } from './usePasswordChange'
import './adminUsers.css'

/** Попап «Змінити пароль» (відкривається з меню акаунта, без переходу на окрему сторінку). */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <Inner onClose={onClose} />
}

function Inner({ onClose }: { onClose: () => void }) {
  const f = usePasswordChange()
  const first = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return createPortal(
    <div className="rm-backdrop" style={{ zIndex: 230 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="rm-dialog" role="dialog" aria-modal="true" aria-label="Змінити пароль" onSubmit={f.submit}>
        <h2>Змінити пароль</h2>
        {f.done ? (
          <>
            <p role="status">Пароль змінено.</p>
            <div className="rm-buttons"><button type="button" onClick={onClose}>Готово</button></div>
          </>
        ) : (
          <>
            <label>
              Новий пароль
              <input ref={first} type="password" autoComplete="new-password" value={f.pw} onChange={(e) => f.setPw(e.target.value)} />
            </label>
            <label>
              Повторіть пароль
              <input type="password" autoComplete="new-password" value={f.pw2} onChange={(e) => f.setPw2(e.target.value)} />
            </label>
            <p className="muted small">Щонайменше 10 символів.</p>
            {f.error && <p role="alert" className="error">{f.error}</p>}
            <div className="rm-buttons">
              <button type="button" className="secondary" onClick={onClose}>Скасувати</button>
              <button type="submit" disabled={f.busy}>{f.busy ? 'Збереження…' : 'Зберегти пароль'}</button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  )
}

import { useEffect, useState, type ReactNode } from 'react'

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop au-backdrop" onClick={onClose}>
      <div className="modal au-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>{title}</strong>
          <button type="button" className="secondary" onClick={onClose} aria-label="Закрити">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot au-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title, children, confirmLabel, danger, busy, error, onConfirm, onClose,
}: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy: boolean; error: string | null
  onConfirm: () => void; onClose: () => void
}) {
  return (
    <Dialog
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="button" className={danger ? 'danger' : undefined} onClick={onConfirm} disabled={busy}>
            {busy ? 'Зачекайте…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error && <p role="alert" className="error">{error}</p>}
    </Dialog>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Показує згенерований PIN один раз. */
export function PinResultDialog({ title, name, pin, onClose }: { title: string; name: string; pin: string; onClose: () => void }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  return (
    <Dialog title={title} onClose={onClose} footer={<button type="button" onClick={onClose}>Готово, я зберіг(ла) PIN</button>}>
      <p className="muted">Користувач: <strong>{name}</strong></p>
      <p>PIN для входу (показується <strong>лише один раз</strong>):</p>
      <div className="au-secret">
        <code data-testid="pin-value">{pin}</code>
        <button type="button" onClick={async () => setCopied((await copyText(pin)) ? 'ok' : 'fail')}>Копіювати</button>
      </div>
      {copied === 'ok' && <p role="status" className="muted small">Скопійовано.</p>}
      {copied === 'fail' && <p role="alert" className="error">Не вдалося скопіювати — запишіть PIN вручну.</p>}
      <p className="muted small">Передайте PIN особисто. Змінити його може лише адміністратор. Після 3 невдалих спроб вхід блокується.</p>
    </Dialog>
  )
}

/** Показує тимчасовий пароль ОДИН раз: після закриття діалогу значення зникає зі стану. */
export function PasswordResultDialog({ title, email, password, note, onClose }: {
  title: string; email: string | null; password: string; note?: string; onClose: () => void
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  return (
    <Dialog title={title} onClose={onClose} footer={<button type="button" onClick={onClose}>Готово, я зберіг(ла) пароль</button>}>
      {email && <p className="muted">Обліковий запис: <strong>{email}</strong></p>}
      <p>Тимчасовий пароль (показується <strong>лише один раз</strong>):</p>
      <div className="au-secret">
        <code data-testid="temp-password">{password}</code>
        <button type="button" onClick={async () => setCopied((await copyText(password)) ? 'ok' : 'fail')}>Копіювати</button>
      </div>
      {copied === 'ok' && <p role="status" className="muted small">Скопійовано в буфер обміну.</p>}
      {copied === 'fail' && <p role="alert" className="error">Не вдалося скопіювати — виділіть пароль і скопіюйте вручну.</p>}
      <p className="muted small">
        {note ?? 'Передайте пароль працівнику безпечним каналом. При першому вході застосунок попросить змінити його на власний.'}
      </p>
    </Dialog>
  )
}

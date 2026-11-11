import { useEffect, type ReactNode } from 'react'
import { ScrollArea } from '../../components/ui/ScrollArea'

export function Modal({ title, onClose, children, footer, wide, narrow }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; narrow?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal doc-modal${wide ? ' modal-wide' : ''}${narrow ? ' modal-narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>{title}</strong>
          <button type="button" className="secondary" onClick={onClose} aria-label="Закрити">✕</button>
        </header>
        <ScrollArea className="modal-scroll" body="modal-body" inset={16}>{children}</ScrollArea>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

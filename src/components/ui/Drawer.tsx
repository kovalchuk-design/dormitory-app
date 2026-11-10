import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DrawerTitleSlot } from './drawerContext'
import { Icon } from './icons'
import { ScrollArea } from './ScrollArea'

/** Шухляда збоку із затемненням (docs/style.md §6): Esc і клік по тлу закривають, фокус повертається на елемент, що її відкрив. */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])
  return createPortal(
    <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="drawer-bar">
          <span className="drawer-title-slot" ref={setSlot} />
          <button type="button" className="iconbtn" onClick={onClose} title="Закрити" aria-label="Закрити">
            <Icon name="close" />
          </button>
        </div>
        <DrawerTitleSlot.Provider value={slot}>
          <ScrollArea className="drawer-scroll" body="drawer-body" inset={24}>{children}</ScrollArea>
        </DrawerTitleSlot.Provider>
      </aside>
    </div>,
    document.body,
  )
}

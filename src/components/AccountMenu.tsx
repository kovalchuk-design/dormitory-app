import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS } from '../auth/roles'
import { ChangePasswordDialog } from '../features/admin-users'
import { ElevateDialog } from '../features/pin-login'
import { navItemsForRole } from '../routes/navItems'
import { useTheme } from '../lib/theme'
import { useAlarmMode } from '../lib/mode'
import { Icon } from './ui/icons'

const THEME_LABELS = { system: 'Тема: як у системі', light: 'Тема: світла', dark: 'Тема: темна' } as const
const THEME_ICONS = { system: 'auto', light: 'sun', dark: 'moon' } as const

/**
 * Одна іконка «Акаунт» замість окремих кнопок «тема / права адміністратора / пароль / вийти».
 * Меню відкривається клацанням/дотиком (і наведенням миші в рейці), рендериться в body з fixed-позицією —
 * тому не обрізається ні рейкою, ні плаваючою панеллю вкладок на телефоні.
 */
export function AccountMenu({ variant }: { variant: 'rail' | 'tab' }) {
  const { profile, signOut } = useAuth()
  const { pref, cycle } = useTheme()
  const { alarm, toggle: toggleAlarm } = useAlarmMode()
  const [open, setOpen] = useState(false)
  const [elevate, setElevate] = useState(false)
  const [changePw, setChangePw] = useState(false)
  const [pos, setPos] = useState<{ left?: number; right?: number; bottom: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const hoverMode = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    setPos(variant === 'rail'
      ? { left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) }
      : { right: 12, bottom: window.innerHeight - r.top + 10 })
  }, [open, variant])

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', () => setOpen(false), { once: true })
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])

  // Адміністрування — у меню акаунта; пароль адміністратора змінюється там само (керування користувачами), тож «Змінити пароль» йому не потрібен.
  const adminItem = alarm ? undefined : navItemsForRole(profile?.role).find((i) => i.inAccountMenu)
  const canChangePassword = !!profile && !profile.pinSession && profile.role !== 'admin'
  const canElevate = !!profile?.pinSession && !!profile.adminAccount
  const label = profile ? `Акаунт: ${profile.full_name} · ${ROLE_LABELS[profile.role]}` : 'Акаунт'
  const hoverIn = (e: React.PointerEvent) => { if (variant !== 'rail' || e.pointerType !== 'mouse') return; clearTimeout(timer.current); if (!open) { hoverMode.current = true; setOpen(true) } }
  const hoverOut = (e: React.PointerEvent) => { if (variant !== 'rail' || e.pointerType !== 'mouse' || !hoverMode.current) return; timer.current = setTimeout(() => setOpen(false), 200) }

  return (
    <>
      <button
        ref={btn} type="button" className={variant === 'rail' ? 'rail-btn' : 'tab-m'} aria-haspopup="menu" aria-expanded={open}
        aria-label={label} title={label}
        onPointerEnter={hoverIn} onPointerLeave={hoverOut}
        onClick={() => { if (open && !hoverMode.current) setOpen(false); else { hoverMode.current = false; setOpen(true) } }}
      >
        <Icon name="user" size={variant === 'tab' ? 24 : undefined} />
      </button>
      {open && pos && createPortal(
        <div ref={pop} className="account-pop" role="menu" style={pos} onPointerEnter={hoverIn} onPointerLeave={hoverOut}>
          {profile && <div className="account-who"><strong>{profile.full_name}</strong><span className="muted small">{ROLE_LABELS[profile.role]}</span></div>}
          {adminItem && <Link role="menuitem" className="action-item" to={adminItem.to} onClick={() => setOpen(false)}><Icon name="gear" size={18} />{adminItem.label}</Link>}
          <button type="button" role="menuitem" className="action-item" onClick={cycle}><Icon name={THEME_ICONS[pref]} size={18} />{THEME_LABELS[pref]}</button>
          <button type="button" role="menuitem" className="action-item" aria-pressed={alarm} onClick={() => { toggleAlarm(); setOpen(false) }}><Icon name="alarm" size={18} />{alarm ? 'Тривога викл' : 'Тривога вкл'}</button>
          {canElevate && <button type="button" role="menuitem" className="action-item" onClick={() => { setOpen(false); setElevate(true) }}><Icon name="settings" size={18} />Права адміністратора</button>}
          {canChangePassword && <button type="button" role="menuitem" className="action-item" onClick={() => { setOpen(false); setChangePw(true) }}><Icon name="link" size={18} />Змінити пароль</button>}
          <button type="button" role="menuitem" className="action-item" onClick={() => { setOpen(false); void signOut() }}><Icon name="logout" size={18} />Вийти</button>
        </div>,
        document.body,
      )}
      <ElevateDialog open={elevate} onClose={() => setElevate(false)} />
      <ChangePasswordDialog open={changePw} onClose={() => setChangePw(false)} />
    </>
  )
}

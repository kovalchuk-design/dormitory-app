import { BrandMark } from './BrandMark'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useRoundMode } from '../lib/mode'
import { useAuth } from '../auth/useAuth'
import { useQueueCounts } from '../lib/pending'
import { navItemsForRole, type NavItem } from '../routes/navItems'
import { Icon, type IconName } from './ui/icons'
import { AccountMenu } from './AccountMenu'

const NAV_ICONS: Record<string, IconName> = {
  '/hostel': 'bed',
  '/hostel/rooms': 'bed',
  '/hostel/report': 'file',
  '/forms': 'link',
  '/documents': 'file',
  '/events': 'star',
  '/calendar': 'calendar',
  '/admin': 'settings',
}


export function Layout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  // картка учня (/students/…) належить розділу «Гуртожиток»
  const navClass = (to: string, base: string) => ({ isActive }: { isActive: boolean }) =>
    `${base}${isActive || (to === '/hostel' && pathname.startsWith('/students')) ? ' active' : ''}`
  const { round } = useRoundMode()
  // «Обхід»: у нижньому меню / рейці лише «Кімнати» і «Звіт» (замість перемикача вгорі сторінки)
  const ROUND_ITEMS: NavItem[] = [{ to: '/hostel/rooms', label: 'Кімнати' }, { to: '/hostel/report', label: 'Звіт' }]
  const items = round ? ROUND_ITEMS : navItemsForRole(profile?.role).filter((i) => !i.inAccountMenu)
  const counts = useQueueCounts(profile?.role === 'admin')


  const badgeCount = (i: NavItem) => (i.badge === 'forms' ? counts.pending + counts.unmatched : i.badge ? counts[i.badge] : 0)
  const badge = (i: NavItem) =>
    badgeCount(i) > 0 ? (
      <span className="nav-badge">
        {badgeCount(i)}
        <span className="sr-only"> анкет потребують уваги</span>
      </span>
    ) : null

  // «Обхід»: доступний лише «Гуртожиток → Кімнати»
  if (round && !pathname.startsWith('/hostel')) return <Navigate to="/hostel/rooms" replace />

  return (
    <div className="app">
      <nav className="rail" aria-label="Головна навігація">
        <span className="rail-logo" aria-hidden="true"><BrandMark size={34} /></span>
        {items.map((i) => i.disabled ? (
          <span key={i.to} className="rail-btn is-disabled" role="link" aria-disabled="true" title={`${i.label} — ще не доступно`}>
            <Icon name={NAV_ICONS[i.to] ?? 'star'} />
            <span className="rail-tip" aria-hidden="true">{i.label} · скоро</span>
            <span className="sr-only">{i.label} (ще не доступно)</span>
          </span>
        ) : (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={navClass(i.to, 'rail-btn')} title={i.label}>
            <Icon name={NAV_ICONS[i.to] ?? 'star'} />
            {badge(i)}
            <span className="rail-tip" aria-hidden="true">{i.label}</span>
            <span className="sr-only">{i.label}</span>
          </NavLink>
        ))}
        <div className="rail-spacer" />
        <AccountMenu variant="rail" />
      </nav>
      <div className="shell-panel">
        <main className="content">
          <Outlet />
        </main>
      </div>
      <nav className="tabs-m" aria-label="Розділи">
        {/* телефон: лише іконки, без вимкнених пунктів; назва — для скрін-рідерів і підказки */}
        {items.filter((i) => !i.disabled).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={navClass(i.to, 'tab-m')} aria-label={i.label} title={i.label}>
            <Icon name={NAV_ICONS[i.to] ?? 'star'} size={24} />
            {badge(i)}
          </NavLink>
        ))}
        <AccountMenu variant="tab" />
      </nav>
    </div>
  )
}

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS } from '../auth/roles'
import { useQueueCounts } from '../lib/pending'
import { useTheme } from '../lib/theme'
import { navItemsForRole, type NavItem } from '../routes/navItems'
import { Icon, type IconName } from './ui/icons'
import { ElevateButton } from '../features/pin-login'

const NAV_ICONS: Record<string, IconName> = {
  '/hostel': 'bed',
  '/updates': 'refresh',
  '/collect': 'link',
  '/documents': 'file',
  '/events': 'star',
  '/calendar': 'calendar',
  '/admin': 'settings',
}

const THEME_LABELS = { system: 'Тема: як у системі', light: 'Тема: світла', dark: 'Тема: темна' } as const
const THEME_ICONS = { system: 'auto', light: 'sun', dark: 'moon' } as const

export function Layout() {
  const { profile, signOut } = useAuth()
  const { pref, cycle } = useTheme()
  const { pathname } = useLocation()
  // картка учня (/students/…) належить розділу «Гуртожиток»
  const navClass = (to: string, base: string) => ({ isActive }: { isActive: boolean }) =>
    `${base}${isActive || (to === '/hostel' && pathname.startsWith('/students')) ? ' active' : ''}`
  const items = navItemsForRole(profile?.role)
  const counts = useQueueCounts(profile?.role === 'admin')

  const logoutLabel = profile ? `Вийти (${profile.full_name} · ${ROLE_LABELS[profile.role]})` : 'Вийти'

  const badge = (i: NavItem) =>
    i.badge && counts[i.badge] > 0 ? (
      <span className="nav-badge">
        {counts[i.badge]}
        <span className="sr-only">{i.badge === 'pending' ? ' очікують підтвердження' : ' не зіставлено з учнем'}</span>
      </span>
    ) : null

  return (
    <div className="app">
      <nav className="rail" aria-label="Головна навігація">
        <span className="rail-logo" aria-hidden="true"><Icon name="bed" size={22} /></span>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={navClass(i.to, 'rail-btn')} title={i.label}>
            <Icon name={NAV_ICONS[i.to] ?? 'star'} />
            {badge(i)}
            <span className="rail-tip" aria-hidden="true">{i.label}</span>
            <span className="sr-only">{i.label}</span>
          </NavLink>
        ))}
        <div className="rail-spacer" />
        <button type="button" className="rail-btn" onClick={cycle} title={THEME_LABELS[pref]} aria-label={THEME_LABELS[pref]}>
          <Icon name={THEME_ICONS[pref]} />
          <span className="rail-tip" aria-hidden="true">{THEME_LABELS[pref]}</span>
        </button>
        <ElevateButton variant="rail" />
        {!profile?.pinSession && (
          <NavLink to="/password" className={navClass('/password', 'rail-btn')} title="Змінити пароль" aria-label="Змінити пароль">
            <Icon name="settings" />
            <span className="rail-tip" aria-hidden="true">Змінити пароль</span>
          </NavLink>
        )}
        <button type="button" className="rail-btn" onClick={() => void signOut()} title={logoutLabel} aria-label={logoutLabel}>
          <Icon name="logout" />
          <span className="rail-tip" aria-hidden="true">Вийти</span>
        </button>
      </nav>
      <div className="shell-panel">
        <main className="content">
          <Outlet />
        </main>
      </div>
      <nav className="tabs-m" aria-label="Розділи">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={navClass(i.to, 'tab-m')}>
            <Icon name={NAV_ICONS[i.to] ?? 'star'} />
            {badge(i)}
            <span>{i.label.replace('Оновлення даних', 'Оновлення').replace('Адміністрування', 'Адмін')}</span>
          </NavLink>
        ))}
        <button type="button" className="tab-m" onClick={cycle} aria-label={THEME_LABELS[pref]}>
          <Icon name={THEME_ICONS[pref]} />
          <span>Тема</span>
        </button>
        <ElevateButton variant="tab" />
        {!profile?.pinSession && (
          <NavLink to="/password" className={navClass('/password', 'tab-m')}>
            <Icon name="settings" />
            <span>Пароль</span>
          </NavLink>
        )}
        <button type="button" className="tab-m" onClick={() => void signOut()} aria-label={logoutLabel}>
          <Icon name="logout" />
          <span>Вийти</span>
        </button>
      </nav>
    </div>
  )
}

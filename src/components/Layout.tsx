import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS } from '../auth/roles'
import { useQueueCounts } from '../lib/pending'
import { useTheme } from '../lib/theme'
import { navItemsForRole, type NavItem } from '../routes/navItems'
import { Icon, type IconName } from './ui/icons'

const NAV_ICONS: Record<string, IconName> = {
  '/': 'home',
  '/students': 'users',
  '/updates': 'refresh',
  '/collect': 'link',
  '/rooms': 'bed',
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
  const items = navItemsForRole(profile?.role)
  const counts = useQueueCounts(profile?.role === 'admin' || profile?.role === 'educator')

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
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className="rail-btn" title={i.label}>
            <Icon name={NAV_ICONS[i.to] ?? 'star'} />
            {badge(i)}
            <span className="rail-tip" aria-hidden="true">{i.label}</span>
            <span className="sr-only">{i.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="shell-panel">
        <header className="app-top">
          <div className="app-top-title">
            <strong>Гуртожиток</strong>
            <span className="app-top-user">
              {profile?.full_name} · {profile && ROLE_LABELS[profile.role]}
              {profile?.floor != null && ` · ${profile.floor} поверх`}
            </span>
          </div>
          <button type="button" className="iconbtn" onClick={cycle} title={THEME_LABELS[pref]} aria-label={THEME_LABELS[pref]}>
            <Icon name={THEME_ICONS[pref]} />
          </button>
          <button type="button" className="iconbtn" onClick={() => void signOut()} title="Вийти" aria-label="Вийти">
            <Icon name="logout" />
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <nav className="tabs-m" aria-label="Розділи">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className="tab-m">
            <Icon name={NAV_ICONS[i.to] ?? 'star'} />
            {badge(i)}
            <span>{i.label.replace('Оновлення даних', 'Оновлення').replace('Адміністрування', 'Адмін')}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

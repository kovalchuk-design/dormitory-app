import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS } from '../auth/roles'
import { navItemsForRole } from '../routes/navItems'

export function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items = navItemsForRole(profile?.role)

  return (
    <div className="shell">
      <header className="topbar">
        <button
          type="button"
          className="menu-btn"
          aria-label="Меню"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ☰
        </button>
        <strong className="brand">Гуртожиток</strong>
        <span className="topbar-user">
          {profile?.full_name} · {profile && ROLE_LABELS[profile.role]}
          {profile?.floor != null && ` · ${profile.floor} поверх`}
        </span>
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Вийти
        </button>
      </header>
      <div className="body">
        <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Головна навігація">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

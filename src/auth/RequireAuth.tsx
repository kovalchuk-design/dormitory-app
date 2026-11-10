import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { AccountNotice } from '../components/AccountNotice'
import { ChangePasswordPage } from '../features/admin-users'
import { FullScreenMessage } from '../components/FullScreenMessage'

/** Пускає далі лише користувача з активним профілем. */
export function RequireAuth() {
  const { status, profile } = useAuth()
  const location = useLocation()

  switch (status) {
    case 'loading':
      return <FullScreenMessage>Завантаження…</FullScreenMessage>
    case 'signed_out':
      return <Navigate to="/login" replace state={{ from: location.pathname }} />
    case 'no_profile':
    case 'profile_error':
      return <AccountNotice kind={status} />
    default:
      // тимчасовий пароль → обов'язкова зміна до доступу до застосунку
      if (profile?.mustChangePassword) return <ChangePasswordPage forced />
      return <Outlet />
  }
}

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { FullScreenMessage } from '../components/FullScreenMessage'
import { PinLogin } from '../features/pin-login'

/** Вхід лише через вибір вихователя та пароль (див. features/pin-login). */
export function LoginPage() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenMessage>Завантаження…</FullScreenMessage>
  if (status !== 'signed_out') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }
  return <PinLogin />
}

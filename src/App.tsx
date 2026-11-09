import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { AppRoutes } from './routes/AppRoutes'

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}

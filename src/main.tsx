import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import './index.css'
// Дизайн-система (docs/style.md): підключається ПІСЛЯ index.css та стилів фіч, щоб перекривати їх.
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/screens.css'
import './styles/ux-mobile.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

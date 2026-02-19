import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { isMarketingPath } from './lib/marketing'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider, CursorGlow } from './components/ui'
import CommandPalette from './components/ui/CommandPalette'

// Remove preloader
const preloader = document.querySelector('.preloader')
if (preloader) {
  preloader.remove()
}

const isMarketing = isMarketingPath(window.location.pathname)
document.documentElement.classList.toggle('theme-day', isMarketing)

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        {/* Aurora background */}
        <div className="aurora-bg" />

        {/* Cursor glow effect */}
        <CursorGlow />

        {/* Main app */}
        <ErrorBoundary>
          <App />
        </ErrorBoundary>

        {/* Command palette - available everywhere */}
        <CommandPalette commands={[]} />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>,
)

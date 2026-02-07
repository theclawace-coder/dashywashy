/**
 * App - Root Application Component
 *
 * Multi-tenant SaaS CRM with React Router v6.
 * Auth is handled by AuthProvider (src/lib/auth.tsx).
 */

import { useState } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from './lib/auth'

// Page-level auth screens
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import AcceptInvitePage from './pages/auth/AcceptInvitePage'
import AuthCallbackPage from './pages/auth/AuthCallbackPage'

// Onboarding
import OnboardingPage from './pages/onboarding/OnboardingPage'

// Settings pages
import SettingsLayout from './pages/settings/SettingsLayout'
import OrgSettingsPage from './pages/settings/OrgSettingsPage'
import TeamPage from './pages/settings/TeamPage'
import IntegrationsPage from './pages/settings/IntegrationsPage'
import AutomationSettingsPage from './pages/settings/AutomationSettingsPage'
import WorkflowListPage from './pages/settings/WorkflowListPage'
import WorkflowBuilderPage from './pages/settings/WorkflowBuilderPage'
import BillingPage from './pages/settings/BillingPage'

// Feature components
import Dashboard from './components/Dashboard'
import WebhookDebug from './components/WebhookDebug'
import QuotePublicView from './components/QuotePublicView'
import SalesFunnel from './components/SalesFunnel'
import Calendar from './components/Calendar'
import CompletedJobs from './components/CompletedJobs'
import Cleaners from './components/Cleaners'
import CleanersPayout from './components/CleanersPayout'
import Dispatch from './components/Dispatch'
import QuotesSent from './components/QuotesSent'
import RepeatCustomers from './components/RepeatCustomers'
import TodoPage from './components/TodoPage'
import JobModal from './components/JobModal'
import GlobalSearch from './components/GlobalSearch'
import MainNav from './components/MainNav'
import Breadcrumbs from './components/Breadcrumbs'
import NewLeadNotifier from './components/NewLeadNotifier'
import MarketingLoopNotifier from './components/MarketingLoopNotifier'
import ManualTodoPopup from './components/ManualTodoPopup'
import MarketingLoop from './components/MarketingLoop'
import BusinessAnalytics from './components/BusinessAnalytics'
import UserMenu from './components/UserMenu'
import { GlassCard } from './components/ui'
import TourController from './components/TourController'
import AiChatPanel from './components/ai/AiChatPanel'

// ---------------------------------------------------------------------------
// Breadcrumbs helper
// ---------------------------------------------------------------------------

function getBreadcrumbs(path: string): Array<{ label: string; href?: string }> {
  const normalizedPath = path.replace(/\/+$/, '') || '/'

  if (normalizedPath === '/') {
    return [{ label: 'Dashboard' }]
  }

  const pathMap: Record<string, string> = {
    '/salesfunnel': 'Sales Pipeline',
    '/calendar': 'Calendar',
    '/dispatch': 'Dispatch',
    '/cleaners': 'Cleaners',
    '/cleaners-payout': 'Payouts',
    '/completed': 'Completed Jobs',
    '/completed-jobs': 'Completed Jobs',
    '/quotes-sent': 'Quotes',
    '/repeat-customers': 'Repeat Customers',
    '/todo': 'Todo',
    '/marketing-loop': 'Marketing Loop',
    '/analytics': 'Analytics',
    '/settings': 'Settings',
    '/settings/team': 'Team',
    '/settings/integrations': 'Integrations',
    '/settings/automations': 'Automations',
    '/settings/workflows': 'Workflows',
    '/settings/billing': 'Billing',
  }

  const breadcrumbs: Array<{ label: string; href?: string }> = [
    { label: 'Home', href: '/' },
  ]

  if (pathMap[normalizedPath]) {
    breadcrumbs.push({ label: pathMap[normalizedPath] })
  } else if (normalizedPath !== '/') {
    const pathName = normalizedPath.split('/').pop() || ''
    breadcrumbs.push({
      label: pathName.charAt(0).toUpperCase() + pathName.slice(1).replace(/-/g, ' '),
    })
  }

  return breadcrumbs
}

// ---------------------------------------------------------------------------
// PaymentStatus - public page for Stripe redirect
// ---------------------------------------------------------------------------

function PaymentStatus({ success }: { success?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <GlassCard className="w-full max-w-md p-8 text-center">
        <div
          className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
            success ? 'bg-emerald-500/15' : 'bg-amber-500/15'
          }`}
        >
          <svg
            className={`w-8 h-8 ${success ? 'text-emerald-400' : 'text-amber-400'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {success ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            )}
          </svg>
        </div>
        <h1 className="text-title text-white mb-2">
          {success ? 'Payment successful' : 'Payment cancelled'}
        </h1>
        <p className="text-caption">
          {success
            ? 'Thank you! Your payment has been recorded.'
            : 'No charge was made. You can retry your payment anytime.'}
        </p>
      </GlassCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuotePublicWrapper - reads ?quote= search param
// ---------------------------------------------------------------------------

function QuotePublicWrapper() {
  const [searchParams] = useSearchParams()
  const shareToken = searchParams.get('quote')

  if (!shareToken) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen">
      <QuotePublicView shareToken={shareToken} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// RequireUser - requires authenticated user but NOT an org
// ---------------------------------------------------------------------------

function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading, authError } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 bg-red-500/15">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-title text-white mb-2">Authentication Error</h1>
          <p className="text-caption mb-4">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Refresh Page
          </button>
        </GlassCard>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />
  }

  return <>{children}</>
}

// ---------------------------------------------------------------------------
// RequireAuth - requires authenticated user AND a selected org.
// Renders <AppLayout> with an <Outlet> for nested routes.
// ---------------------------------------------------------------------------

function RequireAuth() {
  const { user, currentOrg, loading, authError, orgLoading, orgLoadError } = useAuth()

  if (loading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (authError || orgLoadError) {
    const message = authError || orgLoadError || 'An unexpected error occurred.'
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 bg-red-500/15">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-title text-white mb-2">Authentication Error</h1>
          <p className="text-caption mb-4">{message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Refresh Page
          </button>
        </GlassCard>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />
  }

  if (!currentOrg) {
    return <Navigate to="/onboarding" replace />
  }

  return <AppLayout />
}

// ---------------------------------------------------------------------------
// AppLayout - common chrome for all authenticated pages
// ---------------------------------------------------------------------------

function AppLayout() {
  const location = useLocation()
  const breadcrumbs = getBreadcrumbs(location.pathname)

  return (
    <div className="app-shell">
      <UserMenu />
      <MainNav />
      <TourController />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <Breadcrumbs items={breadcrumbs} />
      </div>

      <GlobalSearch />
      <NewLeadNotifier />
      <MarketingLoopNotifier />
      <ManualTodoPopup />

      <Outlet />

      <JobModal />
      <AiChatPanel />
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardPage - Dashboard + WebhookDebug toggle
// ---------------------------------------------------------------------------

function DashboardPage() {
  const [showWebhookLogs, setShowWebhookLogs] = useState(false)

  return (
    <>
      <Dashboard />

      {showWebhookLogs && (
        <div className="fixed inset-x-0 bottom-20 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
            <div className="relative">
              <button
                onClick={() => setShowWebhookLogs(false)}
                className="absolute -top-3 right-0 px-3 py-1 text-xs rounded-full bg-[var(--color-surface)] border border-[var(--glass-border)] text-[var(--color-text-secondary)] hover:text-white"
              >
                Close
              </button>
              <WebhookDebug />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowWebhookLogs((prev) => !prev)}
        className="fixed bottom-4 right-4 z-40 px-4 py-2 text-xs font-medium rounded-full bg-[var(--color-surface)] border border-[var(--glass-border)] text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-hover)] transition-colors"
        aria-expanded={showWebhookLogs}
      >
        {showWebhookLogs ? 'Hide Logs' : 'Logs'}
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// App - route definitions
// ---------------------------------------------------------------------------

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<SignupPage />} />
      <Route path="/auth/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/payment-success" element={<PaymentStatus success={true} />} />
      <Route path="/payment-cancel" element={<PaymentStatus success={false} />} />
      <Route path="/quote" element={<QuotePublicWrapper />} />

      {/* Onboarding (needs auth but not org) */}
      <Route
        path="/onboarding"
        element={
          <RequireUser>
            <OnboardingPage />
          </RequireUser>
        }
      />

      {/* Protected routes (need auth + org) */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/salesfunnel" element={<SalesFunnel />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/dispatch" element={<Dispatch />} />
        <Route path="/cleaners" element={<Cleaners />} />
        <Route path="/cleaners-payout" element={<CleanersPayout />} />
        <Route path="/completed" element={<CompletedJobs />} />
        <Route path="/completed-jobs" element={<CompletedJobs />} />
        <Route path="/quotes-sent" element={<QuotesSent />} />
        <Route path="/repeat-customers" element={<RepeatCustomers />} />
        <Route path="/todo" element={<TodoPage />} />
        <Route path="/marketing-loop" element={<MarketingLoop />} />
        <Route path="/analytics" element={<BusinessAnalytics />} />
        <Route path="/settings" element={<SettingsLayout><OrgSettingsPage /></SettingsLayout>} />
        <Route path="/settings/team" element={<SettingsLayout><TeamPage /></SettingsLayout>} />
        <Route path="/settings/integrations" element={<SettingsLayout><IntegrationsPage /></SettingsLayout>} />
        <Route path="/settings/automations" element={<SettingsLayout><AutomationSettingsPage /></SettingsLayout>} />
        <Route path="/settings/workflows" element={<SettingsLayout><WorkflowListPage /></SettingsLayout>} />
        <Route path="/settings/workflows/new" element={<SettingsLayout><WorkflowBuilderPage /></SettingsLayout>} />
        <Route path="/settings/workflows/:id" element={<SettingsLayout><WorkflowBuilderPage /></SettingsLayout>} />
        <Route path="/settings/billing" element={<SettingsLayout><BillingPage /></SettingsLayout>} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import KangarooMascot from './KangarooMascot'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/ai-agent', label: 'AI Agent' },
  { to: '/inside', label: 'Inside CRM' },
  { to: '/memberships', label: 'Memberships' },
  { to: '/faq', label: 'FAQ' },
]

const FOOTER_COL_1 = [
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/ai-agent', label: 'AI Agent' },
]

const FOOTER_COL_2 = [
  { to: '/inside', label: 'Inside CRM' },
  { to: '/memberships', label: 'Memberships' },
  { to: '/faq', label: 'FAQ' },
  { to: '/auth/signup', label: 'Sign up' },
]

export default function MarketingLayout() {
  const [count, setCount] = useState(0)
  const [mobileNav, setMobileNav] = useState(false)
  const maxUsers = 200
  const currentUsers = 50

  useEffect(() => {
    let current = 0
    const step = Math.ceil(currentUsers / 20)
    const timer = setInterval(() => {
      current += step
      if (current >= currentUsers) {
        setCount(currentUsers)
        clearInterval(timer)
      } else {
        setCount(current)
      }
    }, 60)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="marketing-shell">
      <div className="marketing-bg" aria-hidden="true">
        <div className="marketing-orb orb-1" />
        <div className="marketing-orb orb-2" />
        <div className="marketing-orb orb-3" />
        <div className="marketing-grid" />
      </div>

      <a href="#main" className="sr-only focus-ring marketing-skip">
        Skip to content
      </a>

      {/* Urgency banner */}
      <div className="marketing-banner">
        <div className="marketing-banner-inner">
          <span className="marketing-banner-text">
            Free for the first 200 teams &middot; No credit card required
          </span>
          <span className="marketing-banner-count">
            {count} / {maxUsers} spots claimed
          </span>
        </div>
      </div>

      {/* Navigation */}
      <header className="marketing-nav">
        <div className="marketing-nav-inner">
          <Link to="/" className="marketing-logo">
            <span className="marketing-logo-mark" aria-hidden="true">
              <KangarooMascot size="sm" animate={false} />
            </span>
            <span className="marketing-logo-text">CRMroo</span>
          </Link>

          <button
            className="marketing-mobile-toggle"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Toggle navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              {mobileNav ? (
                <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <nav className={`marketing-links ${mobileNav ? 'marketing-links-open' : ''}`} aria-label="Primary">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `marketing-link ${isActive ? 'marketing-link-active' : ''}`
                }
                end={item.to === '/'}
                onClick={() => setMobileNav(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="marketing-actions">
            <Link to="/auth/login" className="btn btn-secondary btn-sm marketing-btn">
              Sign in
            </Link>
            <Link to="/auth/signup" className="btn btn-primary btn-sm marketing-btn">
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Floating mascot */}
      <div className="marketing-mascot-float" aria-hidden="true">
        <KangarooMascot size="md" animate showLabel />
      </div>

      <main id="main" className="marketing-main">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <div className="marketing-footer-brand-col">
            <div className="marketing-footer-brand-row">
              <KangarooMascot size="sm" animate={false} />
              <span className="marketing-footer-brand">CRMroo</span>
            </div>
            <p className="marketing-footer-copy">
              The all-in-one CRM built for membership-first cleaning teams. Pipeline, scheduling,
              dispatch, AI agent, and payments in one platform.
            </p>
            <p className="marketing-footer-tagline">
              Made with care in Sydney, Australia.
            </p>
          </div>

          <div className="marketing-footer-col">
            <span className="marketing-footer-col-title">Product</span>
            <div className="marketing-footer-links">
              {FOOTER_COL_1.map((item) => (
                <Link key={item.to} to={item.to} className="marketing-footer-link">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="marketing-footer-col">
            <span className="marketing-footer-col-title">Resources</span>
            <div className="marketing-footer-links">
              {FOOTER_COL_2.map((item) => (
                <Link key={item.to} to={item.to} className="marketing-footer-link">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="marketing-footer-col">
            <span className="marketing-footer-col-title">Get started</span>
            <p className="marketing-footer-copy">
              Free for the first 200 teams. Set up in under 3 minutes.
            </p>
            <Link to="/auth/signup" className="btn btn-primary btn-sm marketing-btn">
              Start free today
            </Link>
          </div>
        </div>

        <div className="marketing-footer-bottom">
          <span>&copy; {new Date().getFullYear()} CRMroo. All rights reserved.</span>
          <div className="marketing-footer-meta">
            <span>Pipeline &middot; Calendar &middot; Dispatch</span>
            <span>AI Agent &middot; Memberships &middot; Payments</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

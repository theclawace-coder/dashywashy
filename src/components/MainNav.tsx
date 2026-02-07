/**
 * MainNav - Apple-grade Navigation
 * 
 * A floating glass navigation bar that feels weightless yet grounded.
 * Features conversational command access and intelligent notifications.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { LiveIndicator, Kbd } from './ui'

type NavItem = {
  id: string
  label: string
  href: string
  icon: JSX.Element
  accent?: boolean
  badge?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { 
    id: 'dashboard',
    label: 'Dashboard', 
    href: '/',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    )
  },
  { 
    id: 'funnel',
    label: 'Pipeline', 
    href: '/salesfunnel',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    )
  },
  { 
    id: 'calendar',
    label: 'Calendar', 
    href: '/calendar',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    )
  },
  { 
    id: 'dispatch',
    label: 'Dispatch', 
    href: '/dispatch',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    )
  },
  { 
    id: 'quotes',
    label: 'Quotes', 
    href: '/quotes-sent',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  },
  { 
    id: 'completed',
    label: 'Completed', 
    href: '/completed',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  { 
    id: 'payout',
    label: 'Payout', 
    href: '/cleaners-payout',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    )
  },
  { 
    id: 'analytics',
    label: 'Analytics', 
    href: '/analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    accent: true
  },
  { 
    id: 'todo',
    label: 'Todo', 
    href: '/todo',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    badge: true
  },
]

const EXTRA_NAV_ITEMS: NavItem[] = [
  {
    id: 'cleaners',
    label: 'Cleaners',
    href: '/cleaners',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    id: 'repeat',
    label: 'Repeat Customers',
    href: '/repeat-customers',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
      </svg>
    ),
  },
  {
    id: 'marketing',
    label: 'Marketing Loop',
    href: '/marketing-loop',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
      </svg>
    ),
  },
]

const SETTINGS_NAV_ITEM: NavItem = {
  id: 'settings',
  label: 'Settings',
  href: '/settings',
  icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

const normalizePath = (path: string) => {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed || '/'
}

const isActivePath = (href: string, current: string) => {
  const target = normalizePath(href).toLowerCase()
  const path = normalizePath(current).toLowerCase()

  if (target === '/completed') {
    return path === '/completed' || path === '/completed-jobs'
  }

  return path === target
}

export default function MainNav() {
  const { currentOrg, hasRole } = useAuth()
  const location = useLocation()
  const currentPath = location.pathname
  const [todoCount, setTodoCount] = useState(0)
  const extraNavItems = [
    ...EXTRA_NAV_ITEMS,
    ...(hasRole('admin') ? [SETTINGS_NAV_ITEM] : []),
  ]

  // Listen for todo count updates
  useEffect(() => {
    const handleTodoUpdate = (e: CustomEvent<{ count: number }>) => {
      setTodoCount(e.detail.count)
    }

    window.addEventListener('todo-count-update', handleTodoUpdate as EventListener)
    fetchTodoCount()

    return () => {
      window.removeEventListener('todo-count-update', handleTodoUpdate as EventListener)
    }
  }, [])

  const fetchTodoCount = useCallback(async () => {
    if (!currentOrg) return
    try {
      const { supabase } = await import('../lib/supabase')
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000)
      const fiveDaysFromNow = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000)

      const [leadsRes, unassignedRes, payoutsRes, manualRes] = await Promise.all([
        supabase
          .from('extracted_leads')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id)
          .gte('created_at', today.toISOString())
          .lt('created_at', todayEnd.toISOString())
          .or('status.is.null,status.eq.,status.eq.Unanswered'),
        supabase
          .from('booking_occurrences')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id)
          .gte('start_at', today.toISOString())
          .lt('start_at', fiveDaysFromNow.toISOString())
          .is('cleaner_id', null)
          .neq('status', 'cancelled'),
        supabase
          .from('cleaner_payouts')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id)
          .is('paid_at', null),
        supabase
          .from('todos')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id)
          .eq('type', 'manual')
          .eq('is_completed', false)
      ])

      const total = (leadsRes.count || 0) + (unassignedRes.count || 0) + (payoutsRes.count || 0) + (manualRes.count || 0)
      setTodoCount(total)
    } catch (err) {
      console.error('Failed to fetch todo count:', err)
    }
  }, [currentOrg])

  // Refresh count every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchTodoCount, 60000)
    return () => clearInterval(interval)
  }, [fetchTodoCount])

  const openCommandPalette = () => {
    window.dispatchEvent(new Event('open-command-palette'))
  }

  return (
    <header className="nav-main" data-testid="main-nav">
      <div className="nav-shell px-3 sm:px-4 lg:px-4 flex-wrap">
        {/* Logo */}
        <div className="nav-brand order-1 lg:order-none">
          <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="nav-logo">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div className="hidden xl:block">
              <div className="text-xs font-semibold text-white">{currentOrg?.name || 'Little Fish'}</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">Operations Hub</div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="nav-links order-3 w-full flex items-center gap-1 min-w-0 lg:order-none lg:w-auto lg:flex-1 lg:flex-col lg:items-stretch lg:gap-2" data-testid="nav-links">
          <div className="nav-primary flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 lg:flex-col lg:flex-1 lg:items-stretch lg:gap-1 lg:overflow-y-auto lg:overflow-x-visible">
            {[...NAV_ITEMS, ...extraNavItems].map((item) => {
              const active = isActivePath(item.href, currentPath)
              const hasBadge = item.badge && todoCount > 0

              return (
                <Link
                  key={item.id}
                  to={item.href}
                  data-tour={`nav-${item.id}`}
                  data-testid={`nav-link-${item.id}`}
                  className={`nav-item relative ${active ? 'nav-item-active' : ''} ${item.accent ? 'text-indigo-300 hover:text-indigo-200' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {hasBadge && (
                    <span className="nav-badge nav-badge-pulse">
                      {todoCount > 99 ? '99+' : todoCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

        </nav>

        {/* Right side */}
        <div className="nav-actions order-2 lg:order-none flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3 lg:mt-auto" data-testid="nav-actions">
          {/* Command palette trigger */}
          <button
            onClick={openCommandPalette}
            data-tour="global-search"
            data-testid="nav-command-palette"
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] transition-colors lg:w-full lg:justify-between"
          >
            <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <span className="text-xs text-[var(--color-text-muted)] hidden xl:inline">Search...</span>
            <div className="flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </div>
          </button>

          {/* Live indicator */}
          <div className="hidden xl:block">
            <LiveIndicator />
          </div>

          {/* Mobile menu */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-white/5"
            onClick={openCommandPalette}
            data-testid="nav-mobile-menu"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

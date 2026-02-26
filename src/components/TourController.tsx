import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Driver } from 'driver.js'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { buildTourDriver, type TourStep } from '../lib/tour'
import TourMascot from './TourMascot'

const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav-home',
    element: '.nav-main',
    title: 'Welcome to your command center',
    description: 'This is the main navigation hub. Everything in the CRM is one click away.',
    chapter: 'Orientation',
    mascotMood: 'wave',
    mascotMessage: "Hey! I'm Spark — I'll show you around.",
    side: 'bottom',
    align: 'center',
  },
  {
    id: 'dashboard',
    element: '[data-tour="nav-dashboard"]',
    title: 'Dashboard',
    description: 'Your daily command center for leads, activity, and quick actions.',
    chapter: 'Daily Command',
    mascotMood: 'excited',
    mascotMessage: 'Your overview for today, all in one place.',
  },
  {
    id: 'dashboard-actions',
    element: '[data-tour="dashboard-quick-actions"]',
    title: 'Quick actions',
    description: 'Sync, refresh, and take fast actions without leaving the dashboard.',
    chapter: 'Daily Command',
    mascotMood: 'point',
  },
  {
    id: 'dashboard-kpis',
    element: '[data-tour="dashboard-kpis"]',
    title: 'Key metrics',
    description: 'Track calls, messages, quotes, and wins at a glance.',
    chapter: 'Daily Command',
    mascotMood: 'think',
  },
  {
    id: 'dashboard-leads',
    element: '[data-tour="dashboard-leads"]',
    title: 'New leads',
    description: 'Capture today’s leads and add manual entries with one click.',
    chapter: 'Daily Command',
    mascotMood: 'excited',
  },
  {
    id: 'lead-table',
    element: '[data-tour="lead-table"]',
    title: 'Lead management',
    description: 'Review inbound leads, extract details, and move them through the pipeline.',
    chapter: 'Leads & Quotes',
    mascotMood: 'point',
  },
  {
    id: 'communications-log',
    element: '[data-tour="communications-log"]',
    title: 'Communications log',
    description: 'Every call, SMS, and email in one timeline — searchable and sortable.',
    chapter: 'Leads & Quotes',
    mascotMood: 'think',
  },
  {
    id: 'pipeline',
    element: '[data-tour="nav-funnel"]',
    title: 'Pipeline',
    description: 'Start here to manage new leads and move them toward a quote.',
    chapter: 'Leads & Quotes',
    mascotMood: 'point',
  },
  {
    id: 'quotes',
    element: '[data-tour="nav-quotes"]',
    title: 'Quotes',
    description: 'Review and send quotes, share public links, and track status.',
    chapter: 'Leads & Quotes',
    mascotMood: 'celebrate',
  },
  {
    id: 'quote-builder',
    element: '[data-tour="quote-builder"]',
    title: 'Quote builder',
    description: 'Generate pricing, add-ons, and booking details with the guided calculator.',
    chapter: 'Leads & Quotes',
    mascotMood: 'excited',
  },
  {
    id: 'calendar',
    element: '[data-tour="nav-calendar"]',
    title: 'Calendar',
    description: 'Schedule jobs once a quote is accepted and keep the team aligned.',
    chapter: 'Scheduling',
    mascotMood: 'point',
  },
  {
    id: 'calendar-schedule',
    element: '[data-tour="calendar-schedule"]',
    title: 'Schedule jobs',
    description: 'Drag, drop, and manage booking details with full visibility.',
    chapter: 'Scheduling',
    mascotMood: 'wave',
  },
  {
    id: 'dispatch',
    element: '[data-tour="nav-dispatch"]',
    title: 'Dispatch',
    description: 'Assign cleaners and manage who is working where.',
    chapter: 'Scheduling',
    mascotMood: 'point',
  },
  {
    id: 'dispatch-map',
    element: '[data-tour="dispatch-map"]',
    title: 'Dispatch map',
    description: 'See job locations, cleaner coverage, and assign in seconds.',
    chapter: 'Scheduling',
    mascotMood: 'excited',
  },
  {
    id: 'completed',
    element: '[data-tour="nav-completed"]',
    title: 'Completed Jobs',
    description: 'Mark jobs complete, capture notes, and confirm payment status.',
    chapter: 'Payments',
    mascotMood: 'celebrate',
  },
  {
    id: 'payment-tracking',
    element: '[data-tour="payment-tracking"]',
    title: 'Payment tracking',
    description: 'Track invoices, send reminders, and close the loop on revenue.',
    chapter: 'Payments',
    mascotMood: 'think',
  },
  {
    id: 'payouts',
    element: '[data-tour="nav-payout"]',
    title: 'Payouts',
    description: 'Track and pay cleaners once jobs are finished.',
    chapter: 'Payments',
    mascotMood: 'celebrate',
  },
  {
    id: 'search',
    element: '[data-tour="global-search"]',
    title: 'Global search',
    description: 'Jump to any lead, booking, or cleaner instantly (Cmd/Ctrl + K).',
    chapter: 'Search & Settings',
    mascotMood: 'point',
  },
  {
    id: 'user-menu',
    element: '[data-tour="user-menu"]',
    title: 'User menu & settings',
    description: 'Manage your profile, orgs, integrations, and settings here.',
    chapter: 'Search & Settings',
    mascotMood: 'wave',
  },
  {
    id: 'admin-settings',
    element: '[data-tour="user-menu"]',
    title: 'Admin controls',
    description: 'Admins can manage automations, integrations, billing, and org settings.',
    chapter: 'Search & Settings',
    mascotMood: 'think',
    minRole: 'admin',
  },
]

export default function TourController() {
  const { user, currentOrg, hasRole } = useAuth()
  const [tourCompleted, setTourCompleted] = useState<boolean | null>(null)
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)
  const mascotRootRef = useRef<Root | null>(null)
  const mascotContainerRef = useRef<HTMLDivElement | null>(null)

  const steps = useMemo(() => TOUR_STEPS, [])

  const progressKey = useMemo(() => {
    if (!user) return null
    return `tour:last-step:${user.id}:${currentOrg?.id ?? 'no-org'}`
  }, [currentOrg?.id, user])

  const completedKey = useMemo(() => {
    if (!user) return null
    return `tour:completed:${user.id}`
  }, [user])

  const isCompletedLocally = useCallback(() => {
    if (typeof window === 'undefined' || !completedKey) return false
    return window.localStorage.getItem(completedKey) === '1'
  }, [completedKey])

  const markCompletedLocally = useCallback(() => {
    if (typeof window === 'undefined' || !completedKey) return
    window.localStorage.setItem(completedKey, '1')
  }, [completedKey])

  const readProgress = useCallback(() => {
    if (typeof window === 'undefined' || !progressKey) return 0
    const raw = window.localStorage.getItem(progressKey)
    const parsed = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(parsed) ? parsed : 0
  }, [progressKey])

  const saveProgress = useCallback(
    (index: number) => {
      if (typeof window === 'undefined' || !progressKey) return
      window.localStorage.setItem(progressKey, String(index))
    },
    [progressKey]
  )

  const clearProgress = useCallback(() => {
    if (typeof window === 'undefined' || !progressKey) return
    window.localStorage.removeItem(progressKey)
  }, [progressKey])

  const loadPreferences = useCallback(async () => {
    if (!user) {
      setTourCompleted(null)
      return
    }

    if (isCompletedLocally()) {
      setTourCompleted(true)
      return
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('tour_completed')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      setTourCompleted(false)
      return
    }

    const completed = Boolean(data?.tour_completed)
    if (completed) {
      markCompletedLocally()
    }
    setTourCompleted(completed)
  }, [isCompletedLocally, markCompletedLocally, user])

  const persistCompleted = useCallback(async () => {
    if (!user) return
    setTourCompleted(true)
    clearProgress()
    markCompletedLocally()
    await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          tour_completed: true,
          tour_completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
  }, [clearProgress, markCompletedLocally, user])

  const resolveAvailableSteps = useCallback((candidateSteps: TourStep[]) => {
    if (typeof document === 'undefined') return []
    return candidateSteps.filter((step) => {
      if (step.minRole && !hasRole(step.minRole)) return false
      return document.querySelector(step.element)
    })
  }, [hasRole])

  const ensureMascotRoot = useCallback(() => {
    if (typeof document === 'undefined') return null
    if (!mascotContainerRef.current) {
      const container = document.createElement('div')
      container.className = 'tour-mascot-root'
      document.body.appendChild(container)
      mascotContainerRef.current = container
      mascotRootRef.current = createRoot(container)
    }
    return mascotRootRef.current
  }, [])

  const cleanupMascot = useCallback(() => {
    if (mascotRootRef.current) {
      mascotRootRef.current.unmount()
      mascotRootRef.current = null
    }
    if (mascotContainerRef.current) {
      mascotContainerRef.current.remove()
      mascotContainerRef.current = null
    }
  }, [])

  const startTour = useCallback(
    (force = false) => {
      if (!user || !currentOrg) return
      if (!force && tourCompleted) return

      const available = resolveAvailableSteps(steps)
      if (available.length === 0) return

      if (driverRef.current) {
        driverRef.current.destroy()
        driverRef.current = null
      }

      const instance = buildTourDriver(available, {
        onComplete: () => {
          driverRef.current = null
          cleanupMascot()
          persistCompleted()
        },
        onSkip: () => {
          driverRef.current = null
          cleanupMascot()
          // Dismissal counts as completion so auto-tour only appears once.
          persistCompleted()
        },
        onStepChange: (index) => {
          saveProgress(index)
        },
        renderPopover: (_popover, { step }) => {
          const root = ensureMascotRoot()
          if (!root) return
          const position = step.mascotPosition ?? (step.side === 'left' ? 'right' : 'left')
          root.render(
            <TourMascot
              mood={step.mascotMood ?? 'wave'}
              message={step.mascotMessage}
              position={position}
              visible
            />
          )
        },
      })

      driverRef.current = instance
      const resumeIndex = Math.min(Math.max(readProgress(), 0), available.length - 1)
      instance.drive(resumeIndex)
    },
    [currentOrg, persistCompleted, resolveAvailableSteps, steps, tourCompleted, user, cleanupMascot, ensureMascotRoot, readProgress, saveProgress]
  )

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  useEffect(() => {
    if (!currentOrg || tourCompleted !== false || autoStartedRef.current) return
    autoStartedRef.current = true
    const timer = setTimeout(() => startTour(false), 1200)
    return () => clearTimeout(timer)
  }, [currentOrg, startTour, tourCompleted])

  useEffect(() => {
    const handler = () => startTour(true)
    window.addEventListener('start-tour', handler)
    return () => window.removeEventListener('start-tour', handler)
  }, [startTour])

  useEffect(() => () => cleanupMascot(), [cleanupMascot])

  return null
}

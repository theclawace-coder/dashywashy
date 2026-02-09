// ---------------------------------------------------------------------------
// AuthProvider â€“ core multi-tenant authentication & organisation context
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Organization, OrgMembership, OrgRole } from './types'

// Re-export OrgRole so consumers can `import { useAuth, type OrgRole } from '../lib/auth'`
export type { OrgRole } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_TIMEOUT_MS = 20000 // Max time to wait for auth initialization
const isDev = import.meta.env.DEV
const log = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args)
  }
}
const warn = (...args: unknown[]) => {
  if (isDev) {
    console.warn(...args)
  }
}

// ---------------------------------------------------------------------------
// Role hierarchy â€“ higher number = more privileges
// ---------------------------------------------------------------------------

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  cleaner: 1,
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  authError: string | null
  orgLoading: boolean
  orgLoadError: string | null
  currentOrg: Organization | null
  currentRole: OrgRole | null
  memberships: OrgMembership[]
  switchOrg: (orgId: string) => Promise<void>
  signOut: () => Promise<void>
  hasRole: (minRole: OrgRole) => boolean
  reloadOrgData: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null)
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [currentRole, setCurrentRole] = useState<OrgRole | null>(null)
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const lastOrgLoadKeyRef = useRef<string | null>(null)
  const lastOrgLoadAtRef = useRef<number>(0)

  // -----------------------------------------------------------------------
  // Fetch organisation memberships + resolve current org
  // -----------------------------------------------------------------------

  const loadOrgData = useCallback(async (userId: string) => {
    log('[auth] loadOrgData started for userId:', userId)
    setOrgLoading(true)
    setOrgLoadError(null)
    try {
      // 1. Fetch all memberships with joined organisation data
      log('[auth] Fetching organization_members...')

      const membersResult = await supabase
        .from('organization_members')
        .select('*, organization:organizations(*)')
        .eq('user_id', userId)

      log('[auth] organization_members response:', membersResult)

      if (membersResult.error) {
        console.error('[auth] Failed to load memberships:', membersResult.error.message)
        setOrgLoadError('Unable to load organization data. Please refresh and try again.')
        return
      }

      const membershipList: OrgMembership[] = membersResult.data ?? []
      log('[auth] Setting memberships, count:', membershipList.length)
      setMemberships(membershipList)

      if (membershipList.length === 0) {
        // User has no org memberships yet
        log('[auth] No memberships found, setting org/role to null')
        setCurrentOrg(null)
        setCurrentRole(null)
        setOrgLoading(false)
        setOrgLoadError(null)
        return
      }

      // 2. Try to load preferred org from user_preferences
      log('[auth] Fetching user_preferences...')
      let preferredOrgId: string | null = null

      try {
        const prefsResult = await supabase
          .from('user_preferences')
          .select('current_org_id')
          .eq('user_id', userId)
          .maybeSingle()

        log('[auth] user_preferences response:', prefsResult)

        if (prefsResult.data?.current_org_id) {
          preferredOrgId = prefsResult.data.current_org_id
        }
      } catch (prefsErr) {
        // Non-fatal - just use first membership
        warn('[auth] Failed to load user_preferences, using first membership:', prefsErr)
      }

      // 3. Resolve the active membership â€“ fall back to first if preference
      //    is missing or points to an org the user no longer belongs to.
      const activeMembership =
        membershipList.find((m) => m.org_id === preferredOrgId) ??
        membershipList[0]

      log('[auth] Setting currentOrg:', activeMembership.organization?.name)
      log('[auth] Setting currentRole:', activeMembership.role)
      setCurrentOrg(activeMembership.organization)
      setCurrentRole(activeMembership.role)
      log('[auth] loadOrgData completed successfully')
    } catch (err) {
      console.error('[auth] Unexpected error loading org data:', err)
      setOrgLoadError('Unable to load organization data. Please refresh and try again.')
    }
    finally {
      setOrgLoading(false)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Bootstrap auth + subscribe to changes
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    log('[auth] useEffect init starting...')

    setLoading(true)
    setAuthError(null)

    // Safety timeout: ensure loading is set to false even if everything else fails
    timeoutId = setTimeout(() => {
      if (!cancelled) {
        warn('[auth] Safety timeout reached - forcing loading to false')
        setAuthError('Authentication timed out. Please refresh and try again.')
        setLoading(false)
      }
    }, AUTH_TIMEOUT_MS)

    log('[auth] Setting up onAuthStateChange listener')
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      log('[auth] onAuthStateChange event:', _event, { hasSession: !!newSession })
      if (cancelled) return

      setSession(newSession)
      setUser(newSession?.user ?? null)

      if (newSession?.user) {
        if (_event === 'TOKEN_REFRESHED') {
          log('[auth] TOKEN_REFRESHED - skipping org reload to avoid blocking UI')
        } else {
          const loadKey = newSession?.access_token || newSession.user.id
          const now = Date.now()
          const recentlyLoaded =
            lastOrgLoadKeyRef.current === loadKey && now - lastOrgLoadAtRef.current < 5000

          if (recentlyLoaded) {
            log('[auth] Skipping org reload; already loaded for session')
          } else {
            log('[auth] New session, loading org data...')
            await loadOrgData(newSession.user.id)
            lastOrgLoadKeyRef.current = loadKey
            lastOrgLoadAtRef.current = now
          }
        }
      } else {
        // Signed out â€“ clear org state
        log('[auth] Signed out, clearing org state')
        setMemberships([])
        setCurrentOrg(null)
        setCurrentRole(null)
        setOrgLoading(false)
        setOrgLoadError(null)
        lastOrgLoadKeyRef.current = null
        lastOrgLoadAtRef.current = 0
      }

      if (!cancelled) {
        log('[auth] Setting loading to false (from onAuthStateChange)')
        setLoading(false)
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }
    })

    return () => {
      log('[auth] Cleanup: cancelling and unsubscribing')
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      subscription.unsubscribe()
    }
  }, [loadOrgData])

  // -----------------------------------------------------------------------
  // Switch active organisation
  // -----------------------------------------------------------------------

  const switchOrg = useCallback(
    async (orgId: string) => {
      const membership = memberships.find((m) => m.org_id === orgId)
      if (!membership) {
        throw new Error('You are not a member of that organisation')
      }

      // Persist preference
      if (user) {
        await supabase.from('user_preferences').upsert(
          { user_id: user.id, current_org_id: orgId },
          { onConflict: 'user_id' }
        )
      }

      setCurrentOrg(membership.organization)
      setCurrentRole(membership.role)
    },
    [memberships, user]
  )

  // -----------------------------------------------------------------------
  // Sign out
  // -----------------------------------------------------------------------

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // -----------------------------------------------------------------------
  // Reload org data (public â€” called after org creation in onboarding)
  // -----------------------------------------------------------------------

  const reloadOrgData = useCallback(async () => {
    if (user) {
      await loadOrgData(user.id)
    }
  }, [user, loadOrgData])

  // -----------------------------------------------------------------------
  // Role check
  // -----------------------------------------------------------------------

  const hasRole = useCallback(
    (minRole: OrgRole): boolean => {
      if (!currentRole) return false
      return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[minRole]
    },
    [currentRole]
  )

  // -----------------------------------------------------------------------
  // Memoised context value
  // -----------------------------------------------------------------------

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      authError,
      orgLoading,
      orgLoadError,
      currentOrg,
      currentRole,
      memberships,
      switchOrg,
      signOut,
      hasRole,
      reloadOrgData,
    }),
    [user, session, loading, authError, orgLoading, orgLoadError, currentOrg, currentRole, memberships, switchOrg, signOut, hasRole, reloadOrgData]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}

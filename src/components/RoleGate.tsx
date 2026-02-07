// ---------------------------------------------------------------------------
// RoleGate – declarative role-based visibility gate
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import type { OrgRole } from '../lib/auth'

interface RoleGateProps {
  /** Minimum role required to render children */
  minRole: OrgRole
  /** Content shown when the user meets the role requirement */
  children: ReactNode
  /** Optional content shown when the user does NOT meet the role requirement */
  fallback?: ReactNode
}

/**
 * Renders `children` only when the current user's organisation role is equal
 * to or higher than `minRole` in the hierarchy:
 *
 *   owner (5) > admin (4) > manager (3) > staff (2) > cleaner (1)
 *
 * If the check fails, `fallback` is rendered instead (defaults to nothing).
 */
export function RoleGate({ minRole, children, fallback = null }: RoleGateProps) {
  const { hasRole } = useAuth()

  if (!hasRole(minRole)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

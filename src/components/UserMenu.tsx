/**
 * UserMenu - Dropdown for user avatar showing org info, org switcher, and sign out.
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Badge } from './ui'

const ROLE_COLORS: Record<string, string> = {
  owner: 'warning',
  admin: 'error',
  manager: 'info',
  staff: 'success',
  cleaner: 'success',
}

export default function UserMenu() {
  const { user, currentOrg, currentRole, memberships, switchOrg, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleSwitchOrg = async (orgId: string) => {
    setSwitching(true)
    await switchOrg(orgId)
    setSwitching(false)
    setOpen(false)
    // Reload to re-fetch all data for the new org
    window.location.href = '/app'
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth/login')
  }

  const initials = (user?.email?.charAt(0) ?? 'U').toUpperCase()
  const hasMultipleOrgs = memberships.length > 1

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        data-tour="user-menu"
        className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-[var(--color-surface)] transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-teal-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs font-medium text-white leading-tight truncate max-w-[120px]">
            {currentOrg?.business_name ?? 'No org'}
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] leading-tight truncate max-w-[120px]">
            {user?.email}
          </p>
        </div>
        <svg className={`w-3 h-3 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl glass-elevated p-2 z-50 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User info */}
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-white truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-[var(--color-text-muted)] truncate">{currentOrg?.business_name}</p>
              {currentRole && <Badge variant={ROLE_COLORS[currentRole] as any}>{currentRole}</Badge>}
            </div>
          </div>

          <div className="border-t border-[var(--glass-border)] my-1" />

          {/* Org switcher */}
          {hasMultipleOrgs && (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Switch Organization
              </p>
              {memberships.map((m) => {
                const isActive = m.org_id === currentOrg?.id
                return (
                  <button
                    key={m.org_id}
                    onClick={() => !isActive && handleSwitchOrg(m.org_id)}
                    disabled={isActive || switching}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                      isActive
                        ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                        : 'hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[var(--color-surface-elevated)] flex items-center justify-center text-[10px] font-bold">
                      {m.organization.business_name?.charAt(0) ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.organization.business_name}</p>
                    </div>
                    {isActive && (
                      <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
              <div className="border-t border-[var(--glass-border)] my-1" />
            </>
          )}

          {/* Settings link */}
          <button
            onClick={() => { navigate('/app/settings'); setOpen(false) }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[var(--color-surface)] transition-colors text-[var(--color-text-secondary)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs">Settings</span>
          </button>

          {/* Guided tour */}
          <button
            onClick={() => {
              window.dispatchEvent(new Event('start-tour'))
              setOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[var(--color-surface)] transition-colors text-[var(--color-text-secondary)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            <span className="text-xs">Start Tour</span>
          </button>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[var(--color-surface)] transition-colors text-red-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-xs">Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}

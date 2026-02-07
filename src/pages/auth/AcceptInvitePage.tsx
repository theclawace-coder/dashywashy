/**
 * AcceptInvitePage - Handles organisation invitations
 * Reads invite token from URL, shows invite details, and accepts the invite.
 * If the user is not logged in, shows a login/signup form first.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { GlassCard, Button, Input, Badge, Skeleton } from '../../components/ui'
import type { OrgInvite } from '../../lib/types'

type AuthMode = 'login' | 'signup'

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [invite, setInvite] = useState<OrgInvite | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  // Inline auth form state (when user not logged in)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)

  // -------------------------------------------------------------------------
  // Fetch invite details
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!token) {
      setInviteError('No invite token provided.')
      setLoadingInvite(false)
      return
    }

    async function fetchInvite() {
      const { data, error } = await supabase
        .from('organization_invites')
        .select('*, organization:organizations(id, name, slug, logo_url)')
        .eq('token', token)
        .is('accepted_at', null)
        .maybeSingle()

      if (error || !data) {
        setInviteError('This invite link is invalid or has already been used.')
      } else {
        // Check expiry
        if (new Date(data.expires_at) < new Date()) {
          setInviteError('This invite has expired. Please ask the organisation admin to send a new one.')
        } else {
          setInvite(data as OrgInvite)
        }
      }
      setLoadingInvite(false)
    }

    fetchInvite()
  }, [token])

  // -------------------------------------------------------------------------
  // Accept invite (user must be authenticated)
  // -------------------------------------------------------------------------

  const acceptInvite = async () => {
    if (!token || !user) return
    setAccepting(true)

    try {
      const { error } = await supabase.functions.invoke('accept-invite', {
        body: { token },
      })

      if (error) {
        setInviteError(error.message || 'Failed to accept invite.')
      } else {
        setAccepted(true)
        setTimeout(() => navigate('/'), 2000)
      }
    } catch {
      setInviteError('An unexpected error occurred.')
    } finally {
      setAccepting(false)
    }
  }

  // Auto-accept after login/signup
  useEffect(() => {
    if (user && invite && !accepted && !accepting && !inviteError) {
      acceptInvite()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invite])

  // -------------------------------------------------------------------------
  // Inline auth form handlers
  // -------------------------------------------------------------------------

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthSubmitting(true)

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) {
          setAuthError(error.message)
          return
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        })
        if (error) {
          setAuthError(error.message)
          return
        }
      }
      // After auth state changes, the useEffect above will auto-accept
    } catch {
      setAuthError('An unexpected error occurred.')
    } finally {
      setAuthSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loadingInvite || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8">
          <div className="space-y-4">
            <Skeleton width="60%" height={24} />
            <Skeleton width="100%" height={16} />
            <Skeleton width="100%" height={48} />
          </div>
        </GlassCard>
      </div>
    )
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[var(--color-error-muted)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-heading text-white mb-2">Invite not valid</h1>
          <p className="text-caption mb-6">{inviteError}</p>
          <Link to="/auth/login">
            <Button variant="secondary">Go to Login</Button>
          </Link>
        </GlassCard>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[var(--color-success-muted)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-emerald-400 celebration-checkmark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-heading text-white mb-2">You're in!</h1>
          <p className="text-caption">
            You've joined <span className="text-white font-medium">{invite?.organization?.name}</span>.
            Redirecting to your dashboard...
          </p>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <GlassCard className="w-full max-w-md p-8">
        {/* Invite Details */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h1 className="text-title text-white mb-1">You've been invited</h1>
          <p className="text-caption mb-3">
            Join <span className="text-white font-medium">{invite?.organization?.name}</span>
          </p>
          <Badge variant="info">{invite?.role}</Badge>
        </div>

        {/* If user is logged in, show accept button */}
        {user ? (
          <div className="space-y-4">
            <p className="text-sm text-center text-[var(--color-text-secondary)]">
              Signed in as <span className="text-white">{user.email}</span>
            </p>
            <Button
              variant="primary"
              className="w-full"
              loading={accepting}
              onClick={acceptInvite}
            >
              Accept Invite
            </Button>
          </div>
        ) : (
          /* Not logged in: show inline auth form */
          <>
            <div className="flex mb-6 border-b border-[var(--glass-border)]">
              <button
                className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                  authMode === 'login'
                    ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
                onClick={() => { setAuthMode('login'); setAuthError(null) }}
              >
                Sign In
              </button>
              <button
                className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                  authMode === 'signup'
                    ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
                onClick={() => { setAuthMode('signup'); setAuthError(null) }}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <Input
                  label="FULL NAME"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
              )}
              <Input
                label="EMAIL"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
              <Input
                label="PASSWORD"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === 'signup' ? 'Min. 8 characters' : 'Enter your password'}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                required
              />

              {authError && (
                <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
                  <p className="text-sm text-red-400">{authError}</p>
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" loading={authSubmitting}>
                {authMode === 'login' ? 'Sign in & Accept' : 'Create Account & Accept'}
              </Button>
            </form>
          </>
        )}
      </GlassCard>
    </div>
  )
}

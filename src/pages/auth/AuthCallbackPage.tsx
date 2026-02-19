/**
 * AuthCallbackPage - Handles OAuth callback redirects
 * Shows a loading spinner while Supabase processes the auth callback,
 * then redirects to the dashboard.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    async function handleCallback() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          navigate('/app', { replace: true })
        } else {
          // No session found -- wait a moment for the auth state change
          // then check again
          const timeout = setTimeout(() => {
            navigate('/auth/login', { replace: true })
          }, 5000)

          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, newSession) => {
              if (newSession) {
                clearTimeout(timeout)
                subscription.unsubscribe()
                navigate('/app', { replace: true })
              }
            }
          )

          return () => {
            clearTimeout(timeout)
            subscription.unsubscribe()
          }
        }
    } catch {
        navigate('/auth/login', { replace: true })
    }
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 relative">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--glass-border)]" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--color-accent)] animate-spin" />
        </div>
        <p className="text-caption">Completing sign in...</p>
      </div>
    </div>
  )
}

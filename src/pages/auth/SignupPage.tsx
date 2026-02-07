/**
 * SignupPage - New account registration
 * Creates a Supabase user and initial organisation via edge function
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input } from '../../components/ui'

export default function SignupPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      // 1. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      })

      if (authError) {
        setError(authError.message)
        return
      }

      if (!authData.user) {
        setError('Account creation failed. Please try again.')
        return
      }

      // 2. Create the initial organisation via edge function
      const { error: orgError } = await supabase.functions.invoke('create-organization', {
        body: {
          name: businessName.trim(),
          business_name: businessName.trim(),
          owner_display_name: fullName.trim(),
        },
      })

      if (orgError) {
        console.error('[signup] Failed to create organisation:', orgError)
        // Don't block -- the user is signed up, they can set up org later
      }

      navigate('/onboarding')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <GlassCard className="w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <h1 className="text-title text-white mb-1">Create your account</h1>
          <p className="text-caption">Get started with your new workspace</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="FULL NAME"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith"
            autoComplete="name"
            required
          />
          <Input
            label="BUSINESS NAME"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Cleaning Co."
            required
          />
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
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            required
          />
          <Input
            label="CONFIRM PASSWORD"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            autoComplete="new-password"
            required
          />

          {error && (
            <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Create account
          </Button>
        </form>

        {/* Footer */}
        <p className="text-sm text-center text-[var(--color-text-secondary)] mt-6">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </GlassCard>
    </div>
  )
}

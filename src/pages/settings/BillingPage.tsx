/**
 * BillingPage - Display current plan and upgrade options.
 * Shows usage against monthly job limits.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { getMonthlyJobLimit, getPlanLabel, getUtcMonthBounds, isAiEnabled } from '../../lib/plans'
import { GlassCard, Button, Badge } from '../../components/ui'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['Up to 10 scheduled jobs / month', 'Core CRM features', 'Basic analytics', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$20',
    period: '/month',
    features: ['Up to 100 scheduled jobs / month', 'AI agent access', 'Dialpad integration', 'Priority support'],
    popular: true,
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    price: '$49.95',
    period: '/month',
    features: ['Unlimited scheduled jobs', 'AI agent access', 'Advanced analytics', 'Workflow builder'],
  },
]

export default function BillingPage() {
  const { currentOrg, hasRole } = useAuth()
  const currentPlan = currentOrg?.plan ?? 'free'
  const [jobsUsed, setJobsUsed] = useState<number | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)

  const planLimit = useMemo(() => getMonthlyJobLimit(currentPlan), [currentPlan])
  const planLabel = useMemo(() => getPlanLabel(currentPlan), [currentPlan])
  const aiEnabled = useMemo(() => isAiEnabled(currentPlan), [currentPlan])

  useEffect(() => {
    let cancelled = false
    async function loadUsage() {
      if (!currentOrg) return
      setUsageError(null)
      const { start, end } = getUtcMonthBounds(new Date())
      const { count, error } = await supabase
        .from('booking_occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', currentOrg.id)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())

      if (cancelled) return

      if (error) {
        setUsageError(error.message)
        setJobsUsed(null)
      } else {
        setJobsUsed(count ?? 0)
      }
    }

    loadUsage()
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id])

  if (!hasRole('owner')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">Only the organization owner can manage billing.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-title text-white">Billing & Plan</h1>
        <p className="text-caption mt-1">Manage your subscription and billing details.</p>
      </div>

      {/* Current plan */}
      <GlassCard className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-heading text-white">Current Plan</h2>
            <p className="text-caption mt-1">
              You are on the <strong className="text-white capitalize">{planLabel}</strong> plan.
            </p>
            <p className="text-caption mt-1">
              AI agent: <span className={aiEnabled ? 'text-emerald-300' : 'text-amber-300'}>{aiEnabled ? 'Enabled' : 'Upgrade required'}</span>
            </p>
          </div>
          <Badge variant="info">{planLabel}</Badge>
        </div>
      </GlassCard>

      {/* Usage */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-2">Monthly Job Usage</h2>
        {usageError ? (
          <p className="text-caption text-red-400">Unable to load usage: {usageError}</p>
        ) : (
          <p className="text-caption">
            {jobsUsed === null
              ? 'Loading usage…'
              : planLimit === null
              ? `${jobsUsed} scheduled jobs this month (Unlimited).`
              : `${jobsUsed} of ${planLimit} scheduled jobs used this month.`}
          </p>
        )}
      </GlassCard>

      {/* Plan comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          return (
            <GlassCard
              key={plan.id}
              className={`p-5 relative ${plan.popular ? 'ring-1 ring-[var(--color-accent)]' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="info">Popular</Badge>
                </div>
              )}
              <div className="text-center mb-4">
                <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-white">{plan.price}</span>
                  {plan.period && <span className="text-xs text-[var(--color-text-muted)]">{plan.period}</span>}
                </div>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                    <svg className="w-3.5 h-3.5 text-[var(--color-accent)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                variant={isCurrent ? 'secondary' : 'primary'}
                className="w-full"
                disabled
              >
                {isCurrent ? 'Current Plan' : 'Coming Soon'}
              </Button>
            </GlassCard>
          )
        })}
      </div>

      {/* Billing details stub */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-2">Payment Method</h2>
        <p className="text-caption">
          Subscription billing will be available soon. You will be able to manage your payment method and view invoices here.
        </p>
      </GlassCard>
    </div>
  )
}

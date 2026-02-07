/**
 * BillingPage - Display current plan and upgrade options.
 * Stub for future subscription management.
 */

import { useAuth } from '../../lib/auth'
import { GlassCard, Button, Badge } from '../../components/ui'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['Up to 5 users', 'Up to 10 cleaners', 'Basic analytics', 'Email support'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/month',
    features: ['Up to 15 users', 'Up to 30 cleaners', 'Full analytics', 'SMS & email marketing', 'Priority support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/month',
    features: ['Up to 50 users', 'Unlimited cleaners', 'Advanced analytics', 'Custom branding', 'API access', 'Dedicated support'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited users', 'Unlimited cleaners', 'White-label', 'SLA guarantee', 'Custom integrations', 'Account manager'],
  },
]

export default function BillingPage() {
  const { currentOrg, hasRole } = useAuth()
  const currentPlan = currentOrg?.plan ?? 'free'

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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-heading text-white">Current Plan</h2>
            <p className="text-caption mt-1">
              You are on the <strong className="text-white capitalize">{currentPlan}</strong> plan.
            </p>
          </div>
          <Badge variant="info">{currentPlan}</Badge>
        </div>
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

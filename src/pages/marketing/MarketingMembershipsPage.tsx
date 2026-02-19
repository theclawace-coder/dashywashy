import { Link } from 'react-router-dom'
import CrmShot from '../../components/marketing/CrmShot'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const TEAM_PLANS = [
  {
    name: 'Free',
    price: '$0',
    description: 'For new cleaning teams launching memberships.',
    features: ['Up to 10 scheduled jobs / month', 'Core CRM', 'Membership billing', 'Email support'],
  },
  {
    name: 'Growth',
    price: '$20',
    description: 'For growing teams managing regular bookings.',
    features: ['Up to 100 scheduled jobs / month', 'AI agent access', 'Dialpad integration', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Unlimited',
    price: '$49.95',
    description: 'For multi-team operations and advanced analytics.',
    features: ['Unlimited bookings', 'AI agent actions', 'Workflow builder', 'Dedicated success'],
  },
]

const MEMBERSHIP_FEATURES = [
  'Create tiers with custom pricing',
  'Auto renew and retry failed payments',
  'Link members to recurring jobs',
  'Track churn, upgrades, and pauses',
  'Send renewal and renewal reminder flows',
  'Attach membership notes to lead profiles',
]

export default function MarketingMembershipsPage() {
  useMarketingMeta({
    title: 'CRMroo Memberships - Recurring Plans for Cleaning Teams',
    description:
      'Launch cleaning memberships with CRMroo. Build recurring plans, automate renewals, and connect billing to dispatch.',
    keywords:
      'membership crm, cleaning memberships, recurring cleaning plans, cleaning billing, cleaning crm pricing',
    url: 'https://crmroo.com/memberships',
  })

  return (
    <div className="marketing-page">
      <section className="marketing-section">
        <div className="marketing-section-header">
          <h1 className="marketing-display">Memberships your customers can join.</h1>
          <p className="marketing-lead">
            Build recurring revenue with membership plans that connect directly to scheduling,
            dispatch, and payments.
          </p>
        </div>
        <div className="marketing-row">
          <div className="marketing-row-content">
            <h2 className="marketing-title">Design plans in minutes.</h2>
            <p className="marketing-subtitle">
              Create monthly or annual tiers, assign service benefits, and see renewal health
              alongside your pipeline.
            </p>
            <div className="marketing-list-grid">
              {MEMBERSHIP_FEATURES.map((item) => (
                <div key={item} className="marketing-list-item glass-card">
                  <span className="marketing-check" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                      <path
                        d="M5 10l3 3 7-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <CrmShot
            label="Memberships"
            title="Recurring plans"
            summary="Track renewals, upgrades, and active members."
            variant="membership"
          />
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-row">
          <div className="marketing-row-content">
            <h2 className="marketing-title">Customer signup portal</h2>
            <p className="marketing-subtitle">
              Give customers a simple, clean signup flow for recurring plans. The CRM links every
              member back to their lead profile and upcoming jobs.
            </p>
          </div>
          <div className="marketing-signup-card glass-card">
            <h3 className="text-heading">Join a membership</h3>
            <p className="text-body">Choose a plan and start your recurring service.</p>
            <div className="marketing-signup-form">
              <input className="input" placeholder="Full name" />
              <input className="input" placeholder="Email address" />
              <select className="input">
                <option>Clean Core - Monthly</option>
                <option>Move Out Plus - Quarterly</option>
                <option>Weekly Shine - Annual</option>
              </select>
              <button type="button" className="btn btn-primary marketing-btn">
                Join membership
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section-header">
          <h2 className="marketing-title">Pricing for your team</h2>
          <p className="marketing-subtitle">
            Simple plans with everything you need to launch memberships.
          </p>
        </div>
        <div className="marketing-pricing-grid">
          {TEAM_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`marketing-pricing-card glass-card ${
                plan.highlight ? 'pricing-highlight' : ''
              }`}
            >
              <div className="marketing-pricing-header">
                <h3 className="text-heading">{plan.name}</h3>
                <div className="marketing-price">
                  <span className="marketing-price-value">{plan.price}</span>
                  <span className="marketing-price-cycle">per month</span>
                </div>
                <p className="text-body">{plan.description}</p>
              </div>
              <ul className="marketing-pricing-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link to="/auth/signup" className="btn btn-primary marketing-btn">
                Start with {plan.name}
              </Link>
            </div>
          ))}
        </div>
        <div className="marketing-section-footer">
          <Link to="/pricing" className="btn btn-secondary marketing-btn">
            View pricing and currency converter
          </Link>
        </div>
      </section>

      <section className="marketing-cta">
        <div>
          <h2 className="marketing-title">Ready to launch memberships?</h2>
          <p className="marketing-subtitle">
            crmroo.com makes recurring revenue easy for your customers and your team.
          </p>
        </div>
        <div className="marketing-cta-actions">
          <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn">
            Start free
          </Link>
          <Link to="/inside" className="btn btn-secondary btn-lg marketing-btn">
            See inside CRM
          </Link>
        </div>
      </section>
    </div>
  )
}

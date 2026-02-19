import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const PRICING_TIERS = [
  {
    name: 'Free',
    price: 0,
    jobs: 'Up to 10 scheduled jobs / month',
    description: 'Launch your cleaning CRM with core workflows.',
    features: ['Pipeline and calendar', 'Lead capture', 'Cleaner profiles', 'Basic automations'],
  },
  {
    name: 'Growth',
    price: 20,
    jobs: 'Up to 100 scheduled jobs / month',
    description: 'For busy cleaning teams ready to scale.',
    features: ['Everything in Free', 'AI agent access', 'Dialpad integration', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Unlimited',
    price: 49.95,
    jobs: 'Unlimited jobs',
    description: 'Best for multi-team operations.',
    features: ['Everything in Growth', 'AI agent actions', 'Advanced analytics', 'Workflow builder'],
  },
]

const CURRENCY_OPTIONS = ['USD', 'AUD', 'CAD', 'NZD', 'GBP', 'EUR', 'SGD']

type PricingStatus = 'idle' | 'loading' | 'ready'

export default function MarketingPricingPage() {
  useMarketingMeta({
    title: 'CRMroo Pricing - Cleaning CRM Plans',
    description:
      'Choose a cleaning CRM plan that matches your monthly jobs. Free for 10 jobs, Growth for 100 bookings, Unlimited for scale.',
    keywords:
      'cleaning crm pricing, crm for cleaners cost, maid service crm pricing, membership crm pricing',
    url: 'https://crmroo.com/pricing',
  })

  const [currency, setCurrency] = useState('USD')
  const [rate, setRate] = useState(1)
  const [status, setStatus] = useState<PricingStatus>('idle')
  const [autoDetected, setAutoDetected] = useState(false)

  useEffect(() => {
    let active = true
    async function detectCurrency() {
      try {
        const response = await fetch('https://ipapi.co/json/')
        if (!response.ok) return
        const data = await response.json()
        if (active && data?.currency && typeof data.currency === 'string') {
          const nextCurrency = data.currency.toUpperCase()
          if (CURRENCY_OPTIONS.includes(nextCurrency)) {
            setCurrency(nextCurrency)
            setAutoDetected(true)
          }
        }
      } catch {
        // Ignore detection failures
      }
    }

    detectCurrency()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadRate() {
      if (currency === 'USD') {
        setRate(1)
        setStatus('ready')
        return
      }

      setStatus('loading')
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD')
        if (!response.ok) throw new Error('Rate unavailable')
        const data = await response.json()
        const nextRate = data?.rates?.[currency]
        if (active && typeof nextRate === 'number') {
          setRate(nextRate)
          setStatus('ready')
        }
      } catch {
        if (active) {
          setRate(1)
          setStatus('ready')
        }
      }
    }

    loadRate()
    return () => {
      active = false
    }
  }, [currency])

  const formatter = useMemo(() => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })
  }, [currency])

  return (
    <div className="marketing-page">
      <section className="marketing-section">
        <div className="marketing-section-header">
          <h1 className="marketing-display">Simple pricing for cleaning teams.</h1>
          <p className="marketing-lead">
            crmroo.com is built for cleaners and membership-based cleaning businesses. Choose a plan
            that matches how many jobs you run each month.
          </p>
        </div>

        <div className="pricing-controls glass-card">
          <div>
            <p className="text-heading">Local pricing</p>
            <p className="text-body">
              We auto-detect currency by IP and estimate the monthly rate in your local currency.
            </p>
            <p className="text-caption">Estimates update automatically with live exchange rates.</p>
          </div>
          <div className="pricing-select">
            <label className="text-micro">Currency</label>
            <select
              className="input"
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value)
                setAutoDetected(false)
              }}
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className="pricing-status">
              {status === 'loading' ? 'Updating…' : autoDetected ? 'Auto-detected' : 'Manual'}
            </span>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-pricing-grid">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`marketing-pricing-card glass-card ${
                tier.highlight ? 'pricing-highlight' : ''
              }`}
            >
              <div className="marketing-pricing-header">
                <h3 className="text-heading">{tier.name}</h3>
                <div className="marketing-price">
                  <span className="marketing-price-value">
                    {formatter.format(tier.price * rate)}
                  </span>
                  <span className="marketing-price-cycle">per month</span>
                </div>
                <p className="text-body">{tier.jobs}</p>
                <p className="text-body">{tier.description}</p>
              </div>
              <ul className="marketing-pricing-list">
                {tier.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link to="/auth/signup" className="btn btn-primary marketing-btn">
                Start {tier.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-cta">
        <div>
          <h2 className="marketing-title">Free for the first 200 users.</h2>
          <p className="marketing-subtitle">
            Claim a spot and get the Growth plan free while we onboard the first cleaning teams.
          </p>
        </div>
        <div className="marketing-cta-actions">
          <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn">
            Start free
          </Link>
          <Link to="/features" className="btn btn-secondary btn-lg marketing-btn">
            See features
          </Link>
        </div>
      </section>
    </div>
  )
}

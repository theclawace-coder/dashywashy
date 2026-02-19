import { Link } from 'react-router-dom'
import CrmShot from '../../components/marketing/CrmShot'
import AgentShot from '../../components/marketing/AgentShot'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const SHOTS = [
  {
    label: 'Dashboard',
    title: 'Command centre',
    summary: 'Today\'s jobs, pipeline count, revenue, and recent activity in one view.',
    variant: 'dashboard' as const,
  },
  {
    label: 'Sales Pipeline',
    title: 'Kanban board',
    summary: 'Drag leads across seven stages with colour-coded status badges.',
    variant: 'pipeline' as const,
  },
  {
    label: 'Calendar',
    title: 'Weekly scheduling',
    summary: 'Every booking colour-coded. Drag to reschedule. Spot gaps instantly.',
    variant: 'calendar' as const,
  },
  {
    label: 'Dispatch',
    title: 'Map + crew assignment',
    summary: 'Job pins on Mapbox. Assign the nearest crew with one click.',
    variant: 'dispatch' as const,
  },
  {
    label: 'Lead Profile',
    title: 'Customer timeline',
    summary: 'Calls, emails, SMS, notes, and quotes in one scrollable feed.',
    variant: 'leads' as const,
  },
  {
    label: 'Communications',
    title: 'Unified inbox',
    summary: 'Dialpad calls, Outlook emails, and SMS in one filterable log.',
    variant: 'communications' as const,
  },
  {
    label: 'Quotes',
    title: 'Quote management',
    summary: 'Generate, share, and track quotes with Stripe payment links.',
    variant: 'quotes' as const,
  },
  {
    label: 'Cleaners',
    title: 'Team profiles',
    summary: 'Job count, rating, availability, and payout tracking per cleaner.',
    variant: 'cleaners' as const,
  },
  {
    label: 'Analytics',
    title: 'Revenue insights',
    summary: 'Monthly charts for revenue, close rates, and team performance.',
    variant: 'analytics' as const,
  },
  {
    label: 'Todo',
    title: 'Task management',
    summary: 'Priorities, due dates, and auto-generated follow-up tasks.',
    variant: 'todo' as const,
  },
  {
    label: 'Memberships',
    title: 'Recurring plans',
    summary: 'Active members, plan health, renewal status, and billing.',
    variant: 'membership' as const,
  },
  {
    label: 'Workflows',
    title: 'Automation builder',
    summary: 'Visual flows with triggers, conditions, and multi-step actions.',
    variant: 'automation' as const,
  },
]

export default function MarketingInsidePage() {
  useMarketingMeta({
    title: 'Inside CRMroo - Every Screen of the Cleaning CRM',
    description:
      'Preview all 12 core screens of CRMroo: dashboard, pipeline, calendar, dispatch, lead profiles, communications, quotes, cleaners, analytics, todo, memberships, and workflows.',
    keywords:
      'cleaning crm screenshots, crm dashboard, cleaning dispatch, membership crm, pipeline crm, crm preview',
    url: 'https://crmroo.com/inside',
  })

  return (
    <div className="marketing-page">
      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h1 className="marketing-display">Inside CRMroo</h1>
          <p className="marketing-lead">
            Every screen your team will use, every day. Each area is built for speed, clarity,
            and a premium feel. Browse all 12 core views below.
          </p>
        </div>
        <div className="marketing-shot-grid marketing-shot-grid-lg">
          {SHOTS.map((shot) => (
            <CrmShot
              key={shot.title}
              label={shot.label}
              title={shot.title}
              summary={shot.summary}
              variant={shot.variant}
            />
          ))}
        </div>
      </section>

      <section className="marketing-section marketing-spotlight">
        <div className="marketing-spotlight-content">
          <span className="marketing-spotlight-badge">AI Agent</span>
          <h2 className="marketing-title">Plus the AI chat panel.</h2>
          <p className="marketing-subtitle">
            Ask the CRMroo Agent to reschedule, update assignments, or summarise a lead.
            It takes real actions with your approval.
          </p>
        </div>
        <div className="marketing-spotlight-visual">
          <AgentShot title="CRMroo Agent" subtitle="Agentic automation" />
        </div>
      </section>

      <section className="marketing-cta marketing-cta-final">
        <div className="marketing-cta-text">
          <h2 className="marketing-title">Ready to try it?</h2>
          <p className="marketing-subtitle">
            Free for the first 200 teams. Set up in under 3 minutes.
          </p>
        </div>
        <div className="marketing-cta-actions">
          <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn marketing-btn-glow">
            Start free today
          </Link>
          <Link to="/features" className="btn btn-secondary btn-lg marketing-btn">
            See full feature list
          </Link>
        </div>
      </section>
    </div>
  )
}

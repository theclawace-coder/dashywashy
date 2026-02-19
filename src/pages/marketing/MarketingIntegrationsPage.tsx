import AgentShot from '../../components/marketing/AgentShot'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const INTEGRATIONS = [
  {
    title: 'Dialpad calling and SMS',
    description:
      'Make calls, send texts, and log conversations directly from the lead profile.',
  },
  {
    title: 'Facebook lead forms',
    description:
      'Capture leads from Facebook ads and sync them into your pipeline automatically.',
  },
  {
    title: 'Email inbox sync',
    description:
      'Pull emails into the CRM timeline so the whole team sees the conversation.',
  },
  {
    title: 'Webhooks + API',
    description:
      'Connect your website forms, landing pages, and referral tools to CRMroo.',
  },
  {
    title: 'Stripe billing',
    description:
      'Collect membership payments and track status with Stripe-ready flows.',
  },
  {
    title: 'Calendar sync',
    description:
      'Keep bookings aligned across team calendars and dispatch dashboards.',
  },
]

export default function MarketingIntegrationsPage() {
  useMarketingMeta({
    title: 'CRMroo Integrations - Dialpad, Facebook, Email',
    description:
      'Connect Dialpad, Facebook lead forms, email inboxes, and billing to CRMroo for cleaning teams.',
    keywords:
      'dialpad crm, facebook lead forms crm, cleaning crm integrations, email sync crm, cleaning dispatch software',
    url: 'https://crmroo.com/integrations',
  })

  return (
    <div className="marketing-page">
      <section className="marketing-section">
        <div className="marketing-section-header">
          <h1 className="marketing-display">Integrations made for cleaners.</h1>
          <p className="marketing-lead">
            CRMroo connects the tools your cleaning business already uses so your team can keep
            working inside one calm system.
          </p>
        </div>
        <div className="marketing-grid-cards">
          {INTEGRATIONS.map((item) => (
            <div key={item.title} className="marketing-card glass-card">
              <h3 className="text-heading">{item.title}</h3>
              <p className="text-body">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-section marketing-highlight">
        <div className="marketing-highlight-content">
          <h2 className="marketing-title">Seamless Dialpad integration.</h2>
          <p className="marketing-subtitle">
            Call leads, send SMS updates, and keep every touchpoint logged in the CRM. The agent
            can even trigger follow ups for you.
          </p>
        </div>
        <AgentShot title="AI + Dialpad working together" subtitle="Lead actions" compact />
      </section>
    </div>
  )
}

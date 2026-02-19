import { Link } from 'react-router-dom'
import AgentShot from '../../components/marketing/AgentShot'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const AGENT_FEATURES = [
  'Reschedule bookings with natural language',
  'Update cleaner assignments and notes',
  'Send confirmations and reminders automatically',
  'Summarize lead history in seconds',
  'Trigger workflows and follow ups',
]

export default function MarketingAIAgentPage() {
  useMarketingMeta({
    title: 'CRMroo AI Agent - Agentic CRM for Cleaning Teams',
    description:
      'Meet CRMroo Agent: reschedule jobs, update cleaners, and send confirmations with agentic AI built for cleaning teams.',
    keywords:
      'ai crm, agentic ai crm, cleaning crm ai, crm scheduling assistant, cleaning business automation',
    url: 'https://crmroo.com/ai-agent',
  })

  return (
    <div className="marketing-page">
      <section className="marketing-hero">
        <div className="marketing-hero-content">
          <p className="marketing-eyebrow">New</p>
          <h1 className="marketing-display">
            The first cleaning CRM with an agentic AI assistant.
          </h1>
          <p className="marketing-lead">
            CRMroo Agent handles the repetitive work: reschedules, follow ups, and updates across
            the pipeline. Your team stays focused on delivering great cleaning service.
          </p>
          <div className="marketing-hero-actions">
            <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn">
              Start free
            </Link>
            <Link to="/inside" className="btn btn-secondary btn-lg marketing-btn">
              See CRM screens
            </Link>
          </div>
        </div>
        <div className="marketing-hero-media">
          <AgentShot title="CRMroo Agent" subtitle="Agentic automation" compact />
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section-header">
          <h2 className="marketing-title">Agentic actions for cleaning teams.</h2>
          <p className="marketing-subtitle">
            CRMroo Agent works across calendar, dispatch, and customer communications with a single
            request.
          </p>
        </div>
        <div className="marketing-list-grid">
          {AGENT_FEATURES.map((item) => (
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
      </section>
    </div>
  )
}

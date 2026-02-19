import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const FAQS = [
  {
    question: 'Is CRMroo built specifically for cleaning businesses?',
    answer:
      'Yes, every feature is designed for cleaning teams. The pipeline stages, dispatch map, cleaner management, payout tracking, and membership flows are all built for how cleaning businesses operate. We are not a generic CRM with cleaning templates bolted on.',
  },
  {
    question: 'What features are included?',
    answer:
      'CRMroo includes a drag-and-drop sales pipeline, FullCalendar scheduling, Mapbox dispatch, lead profiles with unified communication timelines, Dialpad calling and SMS, Outlook email sync, Facebook lead form capture, quote generation with Stripe payments, membership billing, cleaner management with payouts, an AI agent, workflow builder, business analytics, todo management, global search, marketing loop, and a guided onboarding tour.',
  },
  {
    question: 'Can customers join memberships online?',
    answer:
      'Yes. CRMroo includes a customer-facing signup flow where your clients can choose a membership plan and subscribe. The CRM connects each member to their lead profile, links them to recurring jobs, tracks renewals, and handles Stripe billing automatically.',
  },
  {
    question: 'Does the AI agent take real actions or just suggest?',
    answer:
      'The CRMroo Agent can take real actions: reschedule bookings, update cleaner assignments, send confirmation messages, summarise lead history, and trigger workflow automations. Every action requires your approval before it executes.',
  },
  {
    question: 'Can I import leads from Facebook and email?',
    answer:
      'Yes. CRMroo connects to Facebook Lead Ads and automatically imports new leads into your pipeline. Outlook email sync pulls incoming emails and threads them against the correct lead profile. You can also capture leads via webhooks from your website.',
  },
  {
    question: 'Is Dialpad calling supported?',
    answer:
      'Yes. CRMroo integrates with Dialpad for inbound and outbound calling and SMS. Calls and text messages are logged automatically on the lead timeline with duration and timestamps.',
  },
  {
    question: 'How does dispatch and routing work?',
    answer:
      'The dispatch screen shows a Mapbox map with pins for each scheduled job. Cleaner teams appear with their current status. Assign the nearest available crew with one click. The dispatch list shows each crew\'s daily schedule, notes, and progress.',
  },
  {
    question: 'How much does CRMroo cost?',
    answer:
      'Three plans: Free (up to 10 scheduled jobs/month), Growth ($20/month for up to 100 scheduled jobs), and Unlimited ($49.95/month for unlimited jobs). AI agent access is included in Growth and Unlimited.',
  },
  {
    question: 'Can I manage my cleaning team and track payouts?',
    answer:
      'Yes. Invite cleaners by email or shareable link. Each cleaner gets a profile showing their job count, rating, availability, and completed work. The payout screen calculates earnings based on completed jobs.',
  },
  {
    question: 'Is there a workflow builder?',
    answer:
      'Yes. Build multi-step automations without code. Set triggers, add conditions, and chain actions like auto-assigning owners, sending SMS, and creating follow-up tasks.',
  },
  {
    question: 'Does CRMroo work on mobile?',
    answer:
      'Yes. Fully responsive on phones and tablets. Field teams can check schedules, update job status, and view lead profiles from any device.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Sign up free at crmroo.com. The onboarding wizard sets up your org, invites your team, and configures integrations. A guided tour walks new users through every feature. Operational in under 3 minutes.',
  },
]

export default function MarketingFaqPage() {
  useMarketingMeta({
    title: 'CRMroo FAQ - Questions About the Cleaning CRM',
    description:
      'Answers to common questions about CRMroo: features, pricing, AI agent, Dialpad, memberships, dispatch, and getting started.',
    keywords:
      'cleaning crm faq, crm for cleaners questions, membership crm help, ai crm support, cleaning crm pricing',
    url: 'https://crmroo.com/faq',
  })

  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="marketing-page">
      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h1 className="marketing-display">Frequently asked questions.</h1>
          <p className="marketing-lead">
            Everything you need to know about CRMroo. Can't find your answer?
            Start free and explore, or reach out to our team.
          </p>
        </div>
        <div className="marketing-faq-list">
          {FAQS.map((item, i) => (
            <div
              key={item.question}
              className={`marketing-faq-item glass-card ${openIndex === i ? 'marketing-faq-open' : ''}`}
            >
              <button
                className="marketing-faq-question"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                aria-expanded={openIndex === i}
              >
                <span>{item.question}</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className={`marketing-faq-chevron ${openIndex === i ? 'rotated' : ''}`}
                >
                  <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {openIndex === i && (
                <div className="marketing-faq-answer">
                  <p>{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-cta marketing-cta-final">
        <div className="marketing-cta-text">
          <h2 className="marketing-title">Still have questions?</h2>
          <p className="marketing-subtitle">
            Start free and explore every feature. No credit card required.
          </p>
        </div>
        <div className="marketing-cta-actions">
          <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn marketing-btn-glow">
            Start free today
          </Link>
          <Link to="/features" className="btn btn-secondary btn-lg marketing-btn">
            View all features
          </Link>
        </div>
      </section>
    </div>
  )
}

import { Link } from 'react-router-dom'
import CrmShot from '../../components/marketing/CrmShot'
import AgentShot from '../../components/marketing/AgentShot'
import KangarooMascot from '../../components/marketing/KangarooMascot'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const SOCIAL_PROOF = [
  { metric: '200+', label: 'Cleaning teams signing up' },
  { metric: '15,000+', label: 'Jobs managed monthly' },
  { metric: '42%', label: 'Higher close rates on average' },
  { metric: '3.5hrs', label: 'Saved per team per day' },
]

const FEATURE_DEEP = [
  {
    label: 'Sales Pipeline',
    title: 'See every lead. Miss nothing.',
    description:
      'Your entire sales pipeline in one drag-and-drop board. Every lead flows through clear stages: Unanswered, Follow Up, Quote Sent, Won, and Completed. Colour-coded status badges, time-since-contact indicators, and one-click actions mean your team always knows exactly what to do next. No leads slip through the cracks.',
    variant: 'pipeline' as const,
  },
  {
    label: 'Calendar & Scheduling',
    title: 'Your week at a glance. Every job, every cleaner.',
    description:
      'A full weekly and daily calendar powered by FullCalendar, designed for cleaning operations. See all bookings colour-coded by type, drag to reschedule, and spot gaps in your schedule instantly. Each event links directly to the lead profile and dispatch view, so context is always one click away.',
    variant: 'calendar' as const,
  },
  {
    label: 'Dispatch & Routing',
    title: 'Assign crews in seconds. Route them intelligently.',
    description:
      'A visual dispatch board with an integrated Mapbox map showing job locations, cleaner routes, and real-time status. Match the right crew to each job based on location, availability, and skill set. See who is en route, who is on-site, and who is available, all from one screen.',
    variant: 'dispatch' as const,
  },
  {
    label: 'Lead Profiles',
    title: 'Every touchpoint. One timeline.',
    description:
      'Each lead gets a rich profile page with a unified communication timeline: calls via Dialpad, emails from Outlook, SMS messages, notes from your team, and quotes sent. Know instantly whether a customer prefers mornings, has pets, needs special equipment, or has a membership. This is CRM done right.',
    variant: 'leads' as const,
  },
  {
    label: 'AI Agent',
    title: 'Your smartest team member never sleeps.',
    description:
      'CRMroo Agent is an agentic AI assistant built into the CRM. Ask it to reschedule a booking, update cleaner assignments, draft a follow-up message, or summarise a lead\'s history. It understands your data, takes real actions (with your approval), and saves your team hours of busywork every single day.',
    variant: 'dashboard' as const,
    isAgent: true,
  },
  {
    label: 'Quotes & Payments',
    title: 'Send quotes. Get paid. All tracked.',
    description:
      'Generate professional quotes with line items, attach them to leads, and share via a unique link. Customers can accept and pay online via Stripe. Track pending, accepted, and expired quotes from a single dashboard. No more chasing payments via email.',
    variant: 'quotes' as const,
  },
]

const FEATURE_LIST_COMPLETE = [
  { text: 'Drag-and-drop sales pipeline with 7 status stages', icon: '📊' },
  { text: 'FullCalendar with weekly, daily, and monthly views', icon: '📅' },
  { text: 'Map-based dispatch with Mapbox integration', icon: '🗺️' },
  { text: 'Rich lead profiles with unified comms timeline', icon: '👤' },
  { text: 'Dialpad calling and SMS directly from the CRM', icon: '📞' },
  { text: 'Outlook email sync and inbox management', icon: '📧' },
  { text: 'Facebook lead form capture and auto-import', icon: '📱' },
  { text: 'Agentic AI assistant for scheduling and actions', icon: '🤖' },
  { text: 'Quote generation with Stripe payment links', icon: '💳' },
  { text: 'Membership plans with recurring billing', icon: '🔄' },
  { text: 'Cleaner management, invites, and payout tracking', icon: '👥' },
  { text: 'Workflow builder for automated follow-ups', icon: '⚡' },
  { text: 'Business analytics with revenue and close-rate charts', icon: '📈' },
  { text: 'Global search across leads, bookings, and cleaners', icon: '🔍' },
  { text: 'Todo management with priorities and due dates', icon: '✅' },
  { text: 'Marketing loop for automated re-engagement', icon: '🎯' },
  { text: 'Team roles, permissions, and multi-tenant orgs', icon: '🏢' },
  { text: 'Guided onboarding tour for new team members', icon: '🎓' },
]

const TESTIMONIALS = [
  {
    quote: 'We switched from spreadsheets and saved 4 hours a day. Our team actually enjoys using the CRM now.',
    name: 'Jessica T.',
    role: 'Operations Manager',
    company: 'Sparkle Clean Co.',
  },
  {
    quote: 'The AI agent is incredible. I asked it to reschedule three jobs and it did it in 10 seconds. Game changer.',
    name: 'Marcus W.',
    role: 'Owner',
    company: 'ProClean Sydney',
  },
  {
    quote: 'Memberships brought us predictable revenue. CRMroo made setup painless and our customers love it.',
    name: 'Priya S.',
    role: 'Founder',
    company: 'Fresh Start Cleaning',
  },
]

export default function MarketingHomePage() {
  useMarketingMeta({
    title: 'CRMroo - The Cleaning CRM That Grows Your Business',
    description:
      'CRMroo is the all-in-one CRM built for cleaning businesses. Pipeline, scheduling, dispatch, AI agent, memberships, Dialpad, and Stripe in one platform. Free for the first 200 teams.',
    keywords:
      'cleaning crm, crm for cleaners, membership crm, maid service software, cleaning dispatch, dialpad integration, ai crm, cleaning business software',
    url: 'https://crmroo.com/',
  })

  return (
    <div className="marketing-page">
      {/* ===== HERO ===== */}
      <section className="marketing-hero">
        <div className="marketing-hero-content">
          <div className="marketing-hero-badge">
            <span className="marketing-hero-badge-dot" />
            Now in beta &middot; Free for early teams
          </div>
          <h1 className="marketing-display">
            The CRM that cleaning teams<br />
            <span className="marketing-gradient-text">actually want to use.</span>
          </h1>
          <p className="marketing-lead">
            Stop juggling spreadsheets, WhatsApp, and sticky notes. CRMroo brings your entire cleaning
            operation into one beautiful, intelligent platform. Pipeline. Scheduling. Dispatch. AI. Payments.
            All of it, designed from the ground up for how cleaning businesses actually work.
          </p>
          <div className="marketing-hero-actions">
            <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn marketing-btn-glow">
              Start free today
            </Link>
            <Link to="/inside" className="btn btn-secondary btn-lg marketing-btn">
              See the product
            </Link>
          </div>
          <p className="marketing-hero-note">No credit card required. Set up in under 3 minutes.</p>
        </div>

        <div className="marketing-hero-media">
          <div className="marketing-hero-device">
            <CrmShot
              compact
              label="Dashboard"
              title="Your command centre"
              summary=""
              variant="dashboard"
            />
          </div>
          <div className="marketing-hero-mascot">
            <KangarooMascot size="xl" animate showLabel />
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <section className="marketing-social-proof">
        {SOCIAL_PROOF.map((item) => (
          <div key={item.label} className="marketing-proof-item">
            <span className="marketing-proof-metric">{item.metric}</span>
            <span className="marketing-proof-label">{item.label}</span>
          </div>
        ))}
      </section>

      {/* ===== PROBLEM / SOLUTION ===== */}
      <section className="marketing-section marketing-problem-section">
        <div className="marketing-section-header marketing-center">
          <h2 className="marketing-title">
            Your cleaning business deserves<br />better tools.
          </h2>
          <p className="marketing-subtitle marketing-subtitle-lg">
            Most CRMs are built for tech companies, not service businesses. They are complicated,
            expensive, and miss the features you actually need: dispatch, cleaner management,
            recurring memberships, and smart automation. CRMroo changes that. Every screen, every
            workflow, every button was designed for cleaning teams. Nothing else.
          </p>
        </div>
      </section>

      {/* ===== FEATURE DEEP DIVES ===== */}
      {FEATURE_DEEP.map((feature, i) => (
        <section
          key={feature.label}
          className={`marketing-feature-row ${i % 2 === 1 ? 'marketing-feature-reversed' : ''}`}
        >
          <div className="marketing-feature-content">
            <span className="marketing-feature-label">{feature.label}</span>
            <h2 className="marketing-title">{feature.title}</h2>
            <p className="marketing-feature-description">{feature.description}</p>
            <Link
              to={feature.isAgent ? '/ai-agent' : '/features'}
              className="marketing-feature-link"
            >
              Learn more &rarr;
            </Link>
          </div>
          <div className="marketing-feature-visual">
            {feature.isAgent ? (
              <AgentShot title="CRMroo Agent" subtitle="Agentic AI" compact />
            ) : (
              <CrmShot
                label={feature.label}
                title={feature.title}
                summary=""
                variant={feature.variant}
                compact
              />
            )}
          </div>
        </section>
      ))}

      {/* ===== COMPLETE FEATURE LIST ===== */}
      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h2 className="marketing-title">Everything you need. Nothing you don't.</h2>
          <p className="marketing-subtitle">
            18 core features working together in one platform. No plugins. No add-ons. No surprises.
          </p>
        </div>
        <div className="marketing-complete-grid">
          {FEATURE_LIST_COMPLETE.map((item) => (
            <div key={item.text} className="marketing-complete-item glass-card">
              <span className="marketing-complete-icon">{item.icon}</span>
              <span className="marketing-complete-text">{item.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== INSIDE CRM GALLERY ===== */}
      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h2 className="marketing-title">See every screen.</h2>
          <p className="marketing-subtitle">
            Real mockups from inside CRMroo. What you see is what your team gets.
          </p>
        </div>
        <div className="marketing-shot-grid marketing-shot-grid-lg">
          <CrmShot label="Pipeline" title="Sales board" summary="Drag leads across stages." variant="pipeline" />
          <CrmShot label="Calendar" title="Weekly view" summary="All bookings at a glance." variant="calendar" />
          <CrmShot label="Dispatch" title="Map + crews" summary="Route cleaners visually." variant="dispatch" />
          <CrmShot label="Analytics" title="Revenue charts" summary="Track what matters." variant="analytics" />
          <CrmShot label="Cleaners" title="Team management" summary="Profiles and availability." variant="cleaners" />
          <CrmShot label="Todo" title="Task tracking" summary="Never forget a follow-up." variant="todo" />
        </div>
      </section>

      {/* ===== AI AGENT SPOTLIGHT ===== */}
      <section className="marketing-section marketing-spotlight">
        <div className="marketing-spotlight-content">
          <span className="marketing-spotlight-badge">Powered by AI</span>
          <h2 className="marketing-display marketing-display-sm">
            Meet Roo.<br />
            Your AI-powered<br />
            operations assistant.
          </h2>
          <p className="marketing-subtitle marketing-subtitle-lg">
            CRMroo Agent doesn't just suggest, it acts. Reschedule bookings with natural language.
            Update cleaner assignments. Send confirmations. Summarise lead history. Trigger workflows.
            All from a simple chat interface, with your approval before any action is taken.
          </p>
          <Link to="/ai-agent" className="btn btn-primary btn-lg marketing-btn">
            Meet the AI agent
          </Link>
        </div>
        <div className="marketing-spotlight-visual">
          <AgentShot title="CRMroo Agent" subtitle="Agentic automation" />
        </div>
      </section>

      {/* ===== MEMBERSHIPS ===== */}
      <section className="marketing-section marketing-highlight">
        <div className="marketing-highlight-content">
          <h2 className="marketing-title">Memberships that build recurring revenue.</h2>
          <p className="marketing-subtitle">
            Create monthly and annual cleaning plans your customers can join online. CRMroo handles
            Stripe billing, renewal reminders, plan upgrades, and ties every member back to their
            lead profile and upcoming jobs. Predictable revenue, delighted customers.
          </p>
          <Link to="/memberships" className="btn btn-primary marketing-btn">
            Explore membership flows
          </Link>
        </div>
        <CrmShot
          label="Memberships"
          title="Plans and renewals"
          summary="Track active members and plan health."
          variant="membership"
          compact
        />
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h2 className="marketing-title">Trusted by cleaning teams.</h2>
        </div>
        <div className="marketing-testimonial-grid">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="marketing-testimonial glass-card">
              <p className="marketing-testimonial-quote">"{t.quote}"</p>
              <div className="marketing-testimonial-author">
                <div className="marketing-testimonial-avatar">{t.name[0]}</div>
                <div>
                  <span className="marketing-testimonial-name">{t.name}</span>
                  <span className="marketing-testimonial-role">{t.role}, {t.company}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== INTEGRATIONS STRIP ===== */}
      <section className="marketing-section marketing-center">
        <h2 className="marketing-title">Connects to the tools you already use.</h2>
        <div className="marketing-integrations-strip">
          {['Dialpad', 'Stripe', 'Outlook', 'Facebook', 'Mapbox', 'Webhooks'].map((name) => (
            <div key={name} className="marketing-integration-badge glass-card">
              {name}
            </div>
          ))}
        </div>
        <Link to="/integrations" className="marketing-feature-link">
          View all integrations &rarr;
        </Link>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="marketing-cta marketing-cta-final">
        <KangarooMascot size="lg" animate />
        <div className="marketing-cta-text">
          <h2 className="marketing-title">Ready to run your cleaning business smarter?</h2>
          <p className="marketing-subtitle">
            Join the first 200 teams and get CRMroo free. Set up in minutes, invite your team,
            and see why cleaning businesses are switching.
          </p>
        </div>
        <div className="marketing-cta-actions">
          <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn marketing-btn-glow">
            Start free today
          </Link>
          <Link to="/pricing" className="btn btn-secondary btn-lg marketing-btn">
            See pricing
          </Link>
        </div>
      </section>
    </div>
  )
}

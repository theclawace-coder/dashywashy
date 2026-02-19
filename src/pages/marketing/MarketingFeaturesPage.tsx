import { Link } from 'react-router-dom'
import CrmShot from '../../components/marketing/CrmShot'
import { useMarketingMeta } from '../../lib/useMarketingMeta'

const FEATURE_ROWS = [
  {
    label: 'Sales Pipeline',
    title: 'A Kanban board designed for cleaning leads.',
    summary:
      'Every lead flows through seven clear stages: Unanswered, Marketing, Follow Up, Quote Sent, Won, Completed, and Not Interested. Drag and drop cards between columns. Colour-coded badges show status at a glance. Time-since-contact indicators ensure nothing goes cold. Click any card to open the full lead profile with communication history, quotes, and notes.',
    variant: 'pipeline' as const,
  },
  {
    label: 'Calendar & Scheduling',
    title: 'Weekly, daily, and monthly views. Built on FullCalendar.',
    summary:
      'See every booking colour-coded by job type. Drag events to reschedule. Spot scheduling gaps instantly. Each calendar event links directly to the lead profile and dispatch view. Toolbar buttons toggle between week, day, and month views. A "today" indicator keeps your team oriented, and a live time-marker shows the current hour in day view.',
    variant: 'calendar' as const,
  },
  {
    label: 'Dispatch & Routing',
    title: 'Match crews to jobs with a visual map.',
    summary:
      'An integrated Mapbox map shows all scheduled job locations as pins. Cleaner teams appear with their current status: en route, on-site, or available. Assign the nearest crew with one click. See optimised routes and estimated drive times. The dispatch list below the map shows each crew\'s daily job count, notes, and real-time progress.',
    variant: 'dispatch' as const,
  },
  {
    label: 'Lead Profiles',
    title: 'A unified timeline for every customer interaction.',
    summary:
      'Each lead gets a dedicated profile page. At the top: name, contact details, address, and current pipeline status. Below: a chronological timeline merging Dialpad calls, Outlook emails, SMS messages, team notes, quotes sent, and job history into one scrollable feed. Know everything about a customer before you pick up the phone.',
    variant: 'leads' as const,
  },
  {
    label: 'Communications Hub',
    title: 'Calls, emails, and SMS in one inbox.',
    summary:
      'Filter by channel: All, Calls, Email, or SMS. Every inbound and outbound communication is logged with timestamps and linked to the correct lead. Click any entry to open the full conversation. Dialpad calls show duration. Emails display subject and preview. SMS threads are grouped by contact. Your team never has to context-switch again.',
    variant: 'communications' as const,
  },
  {
    label: 'Quotes & Payments',
    title: 'Professional quotes with Stripe-powered payments.',
    summary:
      'Generate line-item quotes, attach photos and notes, and share via a unique URL. Customers view and accept quotes online. Payments collect automatically through Stripe. Track pending, accepted, and expired quotes from a single dashboard. Link every quote to a lead profile so you see the full revenue story at a glance.',
    variant: 'quotes' as const,
  },
  {
    label: 'Cleaner Management',
    title: 'Profiles, availability, invites, and payouts.',
    summary:
      'Invite cleaners by email or link. Each cleaner gets a profile with job count, rating, availability calendar, and payout history. Track who is available, who is on a job, and who needs to be paid. Cleaner payout reports calculate earnings based on completed jobs, making end-of-week admin painless.',
    variant: 'cleaners' as const,
  },
  {
    label: 'Workflow Builder',
    title: 'Automate the tasks that slow you down.',
    summary:
      'Build visual automation flows with triggers, conditions, and actions. When a new lead arrives from Facebook, auto-assign an owner using round-robin logic, send a welcome SMS via Dialpad, and create a follow-up task in 24 hours, all without writing code. Chain multiple steps together and monitor which workflows fire most.',
    variant: 'automation' as const,
  },
  {
    label: 'Business Analytics',
    title: 'Revenue, close rates, and team performance.',
    summary:
      'Charts and KPI cards show monthly revenue, average ticket size, lead-to-close ratio, and team performance. Compare periods to spot trends. Filter by lead source to see which channels bring the best ROI. Export reports or share dashboards with your team. Make data-driven decisions instead of guessing.',
    variant: 'analytics' as const,
  },
  {
    label: 'Todo & Task Management',
    title: 'Never forget a follow-up again.',
    summary:
      'Create tasks manually or let workflows generate them. Each todo has a priority level, due date, and assignee. Overdue items float to the top. Mark tasks complete with one click. The todo badge on the navigation pulsates when items need attention, keeping your team proactive instead of reactive.',
    variant: 'todo' as const,
  },
]

const EXTRA_FEATURES = [
  'Global search across leads, bookings, cleaners, and settings',
  'Facebook lead form auto-import into pipeline',
  'Outlook email sync with per-lead threading',
  'Dialpad calling and SMS from within the CRM',
  'Guided onboarding tour for new team members',
  'Command palette for keyboard-first navigation',
  'Team roles and permissions with multi-tenant orgs',
  'Marketing loop for automated re-engagement campaigns',
  'Repeat customer tracking and retention metrics',
  'Membership plans with Stripe recurring billing',
  'Real-time notifications for new leads and bookings',
  'Mobile-responsive design for field teams',
]

export default function MarketingFeaturesPage() {
  useMarketingMeta({
    title: 'CRMroo Features - Every Tool Your Cleaning Business Needs',
    description:
      'Explore every CRMroo feature: pipeline, calendar, dispatch, Dialpad, lead profiles, quotes, memberships, AI agent, analytics, workflow builder, and more.',
    keywords:
      'cleaning crm features, dialpad crm, cleaning dispatch software, membership crm, ai agent crm, cleaning pipeline, cleaner management',
    url: 'https://crmroo.com/features',
  })

  return (
    <div className="marketing-page">
      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h1 className="marketing-display">Every feature. One platform.</h1>
          <p className="marketing-lead">
            CRMroo combines 18+ features into a single system designed for cleaning businesses.
            No more juggling separate tools for scheduling, communication, billing, and analytics.
            Everything works together, and every screen is built for speed and clarity.
          </p>
        </div>
      </section>

      {FEATURE_ROWS.map((row, i) => (
        <section
          key={row.title}
          className={`marketing-feature-row ${i % 2 === 1 ? 'marketing-feature-reversed' : ''}`}
        >
          <div className="marketing-feature-content">
            <span className="marketing-feature-label">{row.label}</span>
            <h2 className="marketing-title">{row.title}</h2>
            <p className="marketing-feature-description">{row.summary}</p>
          </div>
          <div className="marketing-feature-visual">
            <CrmShot
              label={row.label}
              title={row.title}
              summary=""
              variant={row.variant}
              compact
            />
          </div>
        </section>
      ))}

      <section className="marketing-section">
        <div className="marketing-section-header marketing-center">
          <h2 className="marketing-title">Plus everything else.</h2>
          <p className="marketing-subtitle">
            Features that round out the full CRM experience.
          </p>
        </div>
        <div className="marketing-complete-grid">
          {EXTRA_FEATURES.map((item) => (
            <div key={item} className="marketing-list-item glass-card">
              <span className="marketing-check" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                  <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-cta marketing-cta-final">
        <div className="marketing-cta-text">
          <h2 className="marketing-title">See it in action.</h2>
          <p className="marketing-subtitle">
            Start free today and explore every feature with your team.
          </p>
        </div>
        <div className="marketing-cta-actions">
          <Link to="/auth/signup" className="btn btn-primary btn-lg marketing-btn marketing-btn-glow">
            Start free
          </Link>
          <Link to="/inside" className="btn btn-secondary btn-lg marketing-btn">
            View CRM screens
          </Link>
        </div>
      </section>
    </div>
  )
}

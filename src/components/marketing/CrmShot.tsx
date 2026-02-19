type CrmShotVariant =
  | 'pipeline'
  | 'calendar'
  | 'dispatch'
  | 'analytics'
  | 'membership'
  | 'automation'
  | 'dashboard'
  | 'leads'
  | 'quotes'
  | 'cleaners'
  | 'todo'
  | 'communications'

interface CrmShotProps {
  label: string
  title: string
  summary: string
  variant: CrmShotVariant
  compact?: boolean
}

/* ---------- Pipeline ---------- */
const pipelineColumns = [
  { title: 'Unanswered', count: '12', tone: 'tone-amber', cards: ['Sarah M.', 'Deep clean'] },
  { title: 'Follow Up', count: '8', tone: 'tone-indigo', cards: ['James L.', 'End-of-lease'] },
  { title: 'Quote Sent', count: '6', tone: 'tone-sky', cards: ['Emily W.'] },
  { title: 'Won', count: '5', tone: 'tone-emerald', cards: ['David K.', 'Office clean'] },
]

function PipelineShot() {
  return (
    <div className="crm-shot-board">
      {pipelineColumns.map((col) => (
        <div key={col.title} className="crm-shot-column">
          <div className="crm-shot-column-header">
            <span>{col.title}</span>
            <span className={`crm-shot-badge ${col.tone}`}>{col.count}</span>
          </div>
          {col.cards.map((card, i) => (
            <div key={i} className="crm-shot-lead-card">
              <div className="crm-shot-lead-name">{card}</div>
              <div className="crm-shot-lead-meta">
                <span className="crm-shot-dot-sm tone-emerald" />
                <span>2h ago</span>
              </div>
            </div>
          ))}
          <div className="crm-shot-card" />
        </div>
      ))}
    </div>
  )
}

/* ---------- Calendar ---------- */
const calDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const calEvents = [
  { top: 12, left: 0, span: 2, label: 'Deep Clean - Sarah', color: 'rgba(14,165,164,0.85)' },
  { top: 44, left: 2, span: 2, label: 'Office - David', color: 'rgba(59,130,246,0.85)' },
  { top: 76, left: 1, span: 1, label: 'Move-out', color: 'rgba(251,191,36,0.85)' },
  { top: 76, left: 3, span: 2, label: 'Regular - Emily', color: 'rgba(167,139,250,0.85)' },
  { top: 108, left: 0, span: 1, label: 'Bond clean', color: 'rgba(14,165,164,0.65)' },
]

function CalendarShot() {
  return (
    <div className="crm-shot-calendar">
      <div className="crm-shot-calendar-header">
        <span className="crm-shot-cal-nav">Feb 2026</span>
        <div className="crm-shot-cal-views">
          <span>Week</span>
          <span className="active">Day</span>
        </div>
      </div>
      <div className="crm-shot-calendar-bar">
        {calDays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="crm-shot-calendar-grid">
        {calEvents.map((ev, i) => (
          <span
            key={i}
            className="crm-shot-event-rich"
            style={{
              top: `${ev.top}px`,
              left: `${ev.left * 20}%`,
              width: `${ev.span * 20 - 2}%`,
              background: ev.color,
            }}
          >
            {ev.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- Dispatch ---------- */
function DispatchShot() {
  return (
    <div className="crm-shot-dispatch">
      <div className="crm-shot-map">
        <span className="crm-shot-pin pin-1" />
        <span className="crm-shot-pin pin-2" />
        <span className="crm-shot-pin pin-3" />
        <span className="crm-shot-route" />
        <span className="crm-shot-map-label">Sydney CBD</span>
      </div>
      <div className="crm-shot-dispatch-list">
        {[
          { name: 'Team Alpha', jobs: '3 jobs', status: 'En route', tone: 'tone-emerald' },
          { name: 'Team Beta', jobs: '2 jobs', status: 'Scheduled', tone: 'tone-amber' },
        ].map((crew) => (
          <div key={crew.name} className="crm-shot-crew-row">
            <span className={`crm-shot-dot ${crew.tone}`} />
            <div className="crm-shot-crew-info">
              <span className="crm-shot-crew-name">{crew.name}</span>
              <span className="crm-shot-crew-meta">{crew.jobs} &middot; {crew.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Analytics ---------- */
function AnalyticsShot() {
  const bars = [35, 55, 45, 72, 88, 65, 78]
  return (
    <div className="crm-shot-analytics">
      <div className="crm-shot-stats-row">
        {[
          { label: 'Revenue', value: '$24,580', change: '+18%' },
          { label: 'Close rate', value: '42%', change: '+5%' },
          { label: 'Avg ticket', value: '$385', change: '+$22' },
        ].map((stat) => (
          <div key={stat.label} className="crm-shot-stat-card">
            <span className="crm-shot-stat-label">{stat.label}</span>
            <span className="crm-shot-stat-value">{stat.value}</span>
            <span className="crm-shot-stat-change">{stat.change}</span>
          </div>
        ))}
      </div>
      <div className="crm-shot-chart">
        {bars.map((h, i) => (
          <span
            key={i}
            className="crm-shot-bar bar-animated"
            style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
    </div>
  )
}

/* ---------- Membership ---------- */
function MembershipShot() {
  return (
    <div className="crm-shot-membership">
      <div className="crm-shot-membership-header-row">
        <span className="crm-shot-membership-count">47 active members</span>
        <span className="crm-shot-pill">Monthly</span>
      </div>
      <div className="crm-shot-membership-list">
        {[
          { name: 'Clean Core', price: '$89/mo', members: '22', status: 'Active' },
          { name: 'Move Out Plus', price: '$149/mo', members: '15', status: 'Active' },
          { name: 'Weekly Shine', price: '$199/mo', members: '10', status: 'Renewing' },
        ].map((plan) => (
          <div key={plan.name} className="crm-shot-member-row">
            <div className="crm-shot-member-info">
              <span className="crm-shot-member-name">{plan.name}</span>
              <span className="crm-shot-member-price">{plan.price}</span>
            </div>
            <span className="crm-shot-badge tone-emerald">{plan.members}</span>
            <span className="crm-shot-badge tone-emerald">{plan.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Automation / Workflow ---------- */
function AutomationShot() {
  const nodes = [
    { icon: '1', label: 'New lead arrives', sublabel: 'Facebook / webhook' },
    { icon: '2', label: 'Auto-assign owner', sublabel: 'Round-robin' },
    { icon: '3', label: 'Send welcome SMS', sublabel: 'Via Dialpad' },
    { icon: '4', label: 'Create follow-up', sublabel: 'In 24 hours' },
  ]
  return (
    <div className="crm-shot-automation">
      {nodes.map((node, i) => (
        <div key={i}>
          <div className="crm-shot-workflow-node">
            <span className="crm-shot-node-icon">{node.icon}</span>
            <div>
              <div className="crm-shot-node-label">{node.label}</div>
              <div className="crm-shot-node-sub">{node.sublabel}</div>
            </div>
          </div>
          {i < nodes.length - 1 && <div className="crm-shot-connector" />}
        </div>
      ))}
    </div>
  )
}

/* ---------- Dashboard ---------- */
function DashboardShot() {
  return (
    <div className="crm-shot-dashboard">
      <div className="crm-shot-dash-metrics">
        {[
          { label: 'Today', value: '8 jobs' },
          { label: 'Pipeline', value: '31 leads' },
          { label: 'Revenue', value: '$4,280' },
          { label: 'Repeat', value: '74%' },
        ].map((m) => (
          <div key={m.label} className="crm-shot-dash-metric">
            <span className="crm-shot-dash-label">{m.label}</span>
            <span className="crm-shot-dash-value">{m.value}</span>
          </div>
        ))}
      </div>
      <div className="crm-shot-dash-grid">
        <div className="crm-shot-mini-chart">
          {[40, 55, 35, 70, 60, 80, 50].map((h, i) => (
            <span key={i} className="crm-shot-mini-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="crm-shot-activity">
          {['New lead: Sarah M.', 'Job completed: #1042', 'Quote accepted: Emily W.'].map((item) => (
            <div key={item} className="crm-shot-activity-row">{item}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- Lead Profile ---------- */
function LeadProfileShot() {
  return (
    <div className="crm-shot-lead-profile">
      <div className="crm-shot-lead-header-row">
        <div className="crm-shot-avatar">SM</div>
        <div>
          <div className="crm-shot-lead-fullname">Sarah Mitchell</div>
          <div className="crm-shot-lead-contact">sarah@email.com</div>
        </div>
        <span className="crm-shot-badge tone-amber">Follow Up</span>
      </div>
      <div className="crm-shot-lead-timeline">
        {[
          { type: 'call', text: 'Called via Dialpad - 4 min', time: '2h ago' },
          { type: 'email', text: 'Quote sent - $320', time: '1d ago' },
          { type: 'note', text: 'Prefers mornings, has pets', time: '2d ago' },
        ].map((entry, i) => (
          <div key={i} className="crm-shot-timeline-entry">
            <span className={`crm-shot-timeline-dot type-${entry.type}`} />
            <div>
              <div className="crm-shot-timeline-text">{entry.text}</div>
              <div className="crm-shot-timeline-time">{entry.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Quotes ---------- */
function QuotesShot() {
  return (
    <div className="crm-shot-quotes">
      <div className="crm-shot-quotes-header">
        <span>Recent Quotes</span>
        <span className="crm-shot-badge tone-emerald">6 pending</span>
      </div>
      {[
        { client: 'Sarah M.', amount: '$320', status: 'Pending', type: 'Deep Clean' },
        { client: 'James L.', amount: '$580', status: 'Accepted', type: 'End of Lease' },
        { client: 'Emily W.', amount: '$150', status: 'Pending', type: 'Regular' },
      ].map((q, i) => (
        <div key={i} className="crm-shot-quote-row">
          <div className="crm-shot-quote-info">
            <span className="crm-shot-quote-client">{q.client}</span>
            <span className="crm-shot-quote-type">{q.type}</span>
          </div>
          <span className="crm-shot-quote-amount">{q.amount}</span>
          <span className={`crm-shot-badge ${q.status === 'Accepted' ? 'tone-emerald' : 'tone-amber'}`}>
            {q.status}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Cleaners ---------- */
function CleanersShot() {
  return (
    <div className="crm-shot-cleaners">
      {[
        { name: 'Maria G.', rating: '4.9', jobs: '128', status: 'Available' },
        { name: 'Tom H.', rating: '4.8', jobs: '96', status: 'On job' },
        { name: 'Lisa P.', rating: '4.7', jobs: '84', status: 'Available' },
      ].map((c) => (
        <div key={c.name} className="crm-shot-cleaner-card">
          <div className="crm-shot-cleaner-avatar">{c.name[0]}</div>
          <div className="crm-shot-cleaner-info">
            <span className="crm-shot-cleaner-name">{c.name}</span>
            <span className="crm-shot-cleaner-meta">{c.jobs} jobs &middot; {c.rating}</span>
          </div>
          <span className={`crm-shot-badge ${c.status === 'Available' ? 'tone-emerald' : 'tone-sky'}`}>
            {c.status}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Todo ---------- */
function TodoShot() {
  return (
    <div className="crm-shot-todo">
      {[
        { text: 'Follow up with Sarah M.', due: 'Today', done: false, priority: 'high' },
        { text: 'Send quote to James L.', due: 'Today', done: false, priority: 'medium' },
        { text: 'Confirm Thursday schedule', due: 'Tomorrow', done: true, priority: 'low' },
        { text: 'Review cleaner payouts', due: 'This week', done: true, priority: 'medium' },
      ].map((item, i) => (
        <div key={i} className={`crm-shot-todo-item ${item.done ? 'done' : ''}`}>
          <span className={`crm-shot-todo-check ${item.done ? 'checked' : ''}`} />
          <div className="crm-shot-todo-content">
            <span className="crm-shot-todo-text">{item.text}</span>
            <span className="crm-shot-todo-due">{item.due}</span>
          </div>
          <span className={`crm-shot-priority priority-${item.priority}`} />
        </div>
      ))}
    </div>
  )
}

/* ---------- Communications ---------- */
function CommunicationsShot() {
  return (
    <div className="crm-shot-comms">
      <div className="crm-shot-comms-tabs">
        <span className="crm-shot-comms-tab active">All</span>
        <span className="crm-shot-comms-tab">Calls</span>
        <span className="crm-shot-comms-tab">Email</span>
        <span className="crm-shot-comms-tab">SMS</span>
      </div>
      {[
        { type: 'call', from: 'Sarah M.', preview: 'Inbound call - 4:32', time: '10m' },
        { type: 'email', from: 'James L.', preview: 'Re: Quote for end-of-lease...', time: '1h' },
        { type: 'sms', from: 'Emily W.', preview: 'Can we move to 9am?', time: '2h' },
      ].map((msg, i) => (
        <div key={i} className="crm-shot-comm-row">
          <span className={`crm-shot-comm-icon type-${msg.type}`} />
          <div className="crm-shot-comm-info">
            <span className="crm-shot-comm-from">{msg.from}</span>
            <span className="crm-shot-comm-preview">{msg.preview}</span>
          </div>
          <span className="crm-shot-comm-time">{msg.time}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Variant router ---------- */
function renderVariant(variant: CrmShotVariant) {
  switch (variant) {
    case 'pipeline': return <PipelineShot />
    case 'calendar': return <CalendarShot />
    case 'dispatch': return <DispatchShot />
    case 'analytics': return <AnalyticsShot />
    case 'membership': return <MembershipShot />
    case 'automation': return <AutomationShot />
    case 'dashboard': return <DashboardShot />
    case 'leads': return <LeadProfileShot />
    case 'quotes': return <QuotesShot />
    case 'cleaners': return <CleanersShot />
    case 'todo': return <TodoShot />
    case 'communications': return <CommunicationsShot />
  }
}

export default function CrmShot({
  label,
  title,
  summary,
  variant,
  compact = false,
}: CrmShotProps) {
  return (
    <figure className={`crm-shot ${compact ? 'crm-shot-compact' : ''}`}>
      <div className={`crm-shot-frame crm-shot-${variant}`} role="img" aria-label={`${title} preview`}>
        <div className="crm-shot-top">
          <span className="crm-shot-dot-red" />
          <span className="crm-shot-dot-yellow" />
          <span className="crm-shot-dot-green" />
          <span className="crm-shot-window-title">{label}</span>
        </div>
        {renderVariant(variant)}
      </div>
      {!compact && (
        <figcaption className="crm-shot-caption">
          <div className="text-micro">{label}</div>
          <h3 className="text-heading">{title}</h3>
          <p className="text-body">{summary}</p>
        </figcaption>
      )}
    </figure>
  )
}

interface AgentShotProps {
  title: string
  subtitle: string
  compact?: boolean
}

const conversation = [
  {
    from: 'user',
    text: "Hey, can you move Amber's clean from Thursday to Monday morning?",
  },
  {
    from: 'agent',
    text: 'Done. Amber is now scheduled for Monday at 9:00 AM. I updated the calendar and sent her a confirmation.',
  },
  {
    from: 'agent',
    text: 'Would you like me to notify the customer as well?',
  },
]

export default function AgentShot({ title, subtitle, compact = false }: AgentShotProps) {
  return (
    <figure className={`agent-shot ${compact ? 'agent-shot-compact' : ''}`}>
      <div className="agent-shot-frame" role="img" aria-label="AI agent conversation preview">
        <div className="agent-shot-header">
          <div className="agent-shot-badge">CRMroo Agent</div>
          <span className="agent-shot-status">Live</span>
        </div>
        <div className="agent-shot-chat">
          {conversation.map((line, index) => (
            <div
              key={`${line.from}-${index}`}
              className={`agent-shot-bubble ${line.from === 'user' ? 'from-user' : 'from-agent'}`}
            >
              {line.text}
            </div>
          ))}
        </div>
        <div className="agent-shot-footer">
          <div className="agent-shot-input">Ask the agent anything about your jobs…</div>
          <div className="agent-shot-action">Run</div>
        </div>
      </div>
      {!compact && (
        <figcaption className="agent-shot-caption">
          <div className="text-micro">{subtitle}</div>
          <h3 className="text-heading">{title}</h3>
          <p className="text-body">
            Agentic actions keep your cleaning team moving. Reschedule, update notes, and send
            confirmations without leaving the dashboard.
          </p>
        </figcaption>
      )}
    </figure>
  )
}

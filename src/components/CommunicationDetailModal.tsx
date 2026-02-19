import type { CommunicationItem } from '../lib/communications'
import { formatDuration } from '../lib/communications'

interface TranscriptModalProps {
  item: CommunicationItem
  onClose: () => void
  onFetchSummary: () => void
  isLoading: boolean
}

export default function CommunicationDetailModal({ item, onClose, onFetchSummary, isLoading }: TranscriptModalProps) {
  const formatSummary = (summary: string | null | undefined) => {
    if (!summary) return null
    const lines = summary.split(/[\n\u2022]/).filter((line) => line.trim())
    return lines
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-surface)] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                item.type === 'call'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : item.type === 'sms'
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {item.type === 'call' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              )}
              {item.type === 'sms' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              )}
              {item.type === 'email' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-white font-semibold">
                {item.type === 'call' ? 'Call Details' : item.type === 'sms' ? 'SMS Details' : 'Email Details'}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {item.external_number || item.from_email || item.to_email || 'Unknown Contact'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {item.type === 'call' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Call Summary</h4>
                {!item.summary && (
                  <button
                    onClick={onFetchSummary}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Get AI Summary
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5">
                {item.summary ? (
                  <ul className="space-y-2">
                    {formatSummary(item.summary)?.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-white">
                        <span className="text-cyan-400 mt-1">&bull;</span>
                        <span>{point.trim()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--color-text-muted)] italic">Click "Get AI Summary" to generate a summary from the call transcript.</p>
                )}
              </div>
            </div>
          )}

          {item.type === 'sms' && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Message Content</h4>
              <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5">
                {item.content ? (
                  <p className="text-white whitespace-pre-wrap">{item.content}</p>
                ) : (
                  <p className="text-[var(--color-text-muted)] italic">No message content available.</p>
                )}
              </div>
            </div>
          )}

          {item.type === 'email' && (
            <>
              <div className="mb-4">
                <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Subject</h4>
                <p className="text-white">{item.subject || 'No subject'}</p>
              </div>
              {item.body && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Email Body</h4>
                  <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5 max-h-48 overflow-y-auto">
                    <div
                      className="email-body-content"
                      dangerouslySetInnerHTML={{ __html: item.body }}
                      style={{
                        color: 'white',
                        fontFamily: 'inherit',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {item.type === 'call' && item.transcript && (
            <div>
              <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Full Transcript</h4>
              <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5 max-h-64 overflow-y-auto">
                <pre className="text-white text-sm whitespace-pre-wrap font-mono leading-relaxed">{item.transcript}</pre>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)]">Direction:</span>
                <span
                  className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.direction === 'outbound' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {item.direction === 'outbound' ? 'Sent' : 'Received'}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Date:</span>
                <span className="ml-2 text-white">{new Date(item.created_at).toLocaleString()}</span>
              </div>
              {item.type === 'call' && item.duration !== undefined && (
                <div>
                  <span className="text-[var(--color-text-muted)]">Duration:</span>
                  <span className="ml-2 text-white">{formatDuration(item.duration) || '-'}</span>
                </div>
              )}
              {item.type === 'email' && (
                <>
                  <div>
                    <span className="text-[var(--color-text-muted)]">From:</span>
                    <span className="ml-2 text-white">{item.from_email || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">To:</span>
                    <span className="ml-2 text-white">{item.to_email || '-'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




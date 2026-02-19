import { Button, GlassCard } from '../../../components/ui'
import type { BookingOccurrence, QuotePin } from '../types'
import { formatCurrency } from '../types'

type NeedsActionQueueProps = {
  jobs: BookingOccurrence[]
  selectedJobId: string | null
  onSelectJob: (occurrenceId: string) => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  quotePins: Record<string, QuotePin>
}

function urgencyLabel(startAt: string) {
  const now = Date.now()
  const start = new Date(startAt).getTime()
  if (Number.isNaN(start)) return { label: 'Unknown', className: 'text-slate-200' }
  const minutes = Math.round((start - now) / 60000)
  if (minutes < 0) return { label: 'Overdue', className: 'text-red-300' }
  if (minutes <= 120) return { label: 'Due soon', className: 'text-amber-300' }
  return { label: 'Upcoming', className: 'text-emerald-300' }
}

export function NeedsActionQueue({
  jobs,
  selectedJobId,
  onSelectJob,
  searchQuery,
  onSearchQueryChange,
  quotePins,
}: NeedsActionQueueProps) {
  return (
    <GlassCard className="overflow-hidden h-full">
      <div className="p-4 border-b border-white/10">
        <div className="text-white font-semibold">Needs Action Queue</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-1">
          Unassigned jobs sorted by start time.
        </div>
        <input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search customer, job, address..."
          className="mt-3 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
        />
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-2 space-y-2">
        {jobs.length === 0 ? (
          <div className="p-3 text-sm text-[var(--color-text-muted)]">No matching unassigned jobs.</div>
        ) : (
          jobs.map((job) => {
            const seriesId = job.series?.id
            const pin = seriesId ? quotePins[seriesId] : null
            const urgency = urgencyLabel(job.start_at)
            const isSelected = selectedJobId === job.id
            const title = `${job.series?.lead?.name || 'Customer'} - ${job.series?.title || 'Job'}`
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelectJob(job.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-cyan-400/60 bg-cyan-500/15'
                    : 'border-amber-400/20 bg-amber-500/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{title}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {new Date(job.start_at).toLocaleString()} - {job.status}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate mt-1">
                      {pin?.address || job.series?.service_address || 'No address yet'}
                    </div>
                    {typeof pin?.total_inc_gst === 'number' ? (
                      <div className="text-xs text-[var(--color-text-muted)] mt-1">
                        Total: {formatCurrency(pin.total_inc_gst)}
                      </div>
                    ) : null}
                  </div>
                  <span className={`text-xs font-medium ${urgency.className}`}>{urgency.label}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={`/app/leads/${job.series?.lead_id || ''}?return=/app/dispatch`}
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-[11px] text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Lead
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.dispatchEvent(
                        new CustomEvent('open-job-modal', { detail: { occurrenceId: job.id } })
                      )
                    }}
                  >
                    Job details
                  </Button>
                </div>
              </button>
            )
          })
        )}
      </div>
    </GlassCard>
  )
}


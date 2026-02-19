import { Button, GlassCard } from '../../../components/ui'
import type {
  BookingOccurrence,
  CleanerRecommendation,
  QuotePin,
} from '../types'
import { formatCurrency } from '../types'
import { formatDistanceKm } from '../utils/ranking'

type AssignmentInspectorProps = {
  selectedJob: BookingOccurrence | null
  recommendations: CleanerRecommendation[]
  quotePins: Record<string, QuotePin>
  assigningOccurrenceId: string | null
  onAssign: (cleaner: CleanerRecommendation, sendSms: boolean) => Promise<void>
}

function StatusPill({ status }: { status: CleanerRecommendation['status'] }) {
  const className =
    status === 'available'
      ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40'
      : status === 'busy'
      ? 'bg-amber-500/20 text-amber-100 border-amber-400/40'
      : 'bg-red-500/20 text-red-100 border-red-400/40'

  return (
    <span className={`px-2 py-0.5 text-[11px] rounded-full border ${className}`}>
      {status}
    </span>
  )
}

export function AssignmentInspector({
  selectedJob,
  recommendations,
  quotePins,
  assigningOccurrenceId,
  onAssign,
}: AssignmentInspectorProps) {
  if (!selectedJob) {
    return (
      <GlassCard className="p-4 h-full">
        <div className="text-white font-semibold">Assignment Inspector</div>
        <div className="text-sm text-[var(--color-text-muted)] mt-3">
          Select a job from the queue to see recommendations and assign.
        </div>
      </GlassCard>
    )
  }

  const seriesId = selectedJob.series?.id
  const pin = seriesId ? quotePins[seriesId] : null
  const isAssigning = assigningOccurrenceId === selectedJob.id
  const jobLabel = `${selectedJob.series?.lead?.name || 'Customer'} - ${selectedJob.series?.title || 'Job'}`

  return (
    <GlassCard className="overflow-hidden h-full">
      <div className="p-4 border-b border-white/10">
        <div className="text-white font-semibold">Assignment Inspector</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-1">
          Job details and top cleaner matches.
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="p-3 rounded-xl border border-white/10 bg-white/5">
          <div className="text-white font-medium">{jobLabel}</div>
          <div className="text-xs text-[var(--color-text-muted)] mt-1">
            {new Date(selectedJob.start_at).toLocaleString()} - {selectedJob.status}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-1">
            {pin?.address || selectedJob.series?.service_address || 'No address yet'}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-1">
            Value: {formatCurrency(pin?.total_inc_gst) || 'Not set'}
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('open-job-modal', { detail: { occurrenceId: selectedJob.id } })
                )
              }
            >
              Open full job details
            </Button>
          </div>
        </div>

        <div>
          <div className="text-white text-sm font-semibold mb-2">Recommended cleaners</div>
          {recommendations.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">No active cleaners available.</div>
          ) : (
            <div className="space-y-3">
              {recommendations.slice(0, 6).map((rec) => (
                <div key={rec.cleaner.id} className="p-3 rounded-xl border border-white/10 bg-black/20">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        {rec.cleaner.full_name}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] mt-1">
                        Score {Math.round(rec.score)} - {formatDistanceKm(rec.distanceKm)}
                      </div>
                    </div>
                    <StatusPill status={rec.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rec.reasons.map((reason) => (
                      <span
                        key={`${rec.cleaner.id}-${reason}`}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-white/80"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={isAssigning || rec.status === 'conflict'}
                      onClick={() => onAssign(rec, false)}
                    >
                      Assign
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isAssigning || rec.status === 'conflict'}
                      onClick={() => onAssign(rec, true)}
                    >
                      Assign + SMS
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}


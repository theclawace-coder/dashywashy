import { Button, GlassCard } from '../../../components/ui'
import type { DispatchViewMode } from '../types'
import { addDays, toYmd } from '../types'

type DispatchHeaderProps = {
  selectedDate: string
  onDateChange: (value: string) => void
  viewMode: DispatchViewMode
  onViewModeChange: (value: DispatchViewMode) => void
}

export function DispatchHeader({
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
}: DispatchHeaderProps) {
  const moveRange = (direction: -1 | 1) => {
    const current = new Date(`${selectedDate}T00:00:00`)
    const next = addDays(current, viewMode === 'week' ? 7 * direction : direction)
    onDateChange(toYmd(next))
  }

  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Dispatch</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Assign unallocated jobs quickly with map and cleaner recommendations.
          </p>
        </div>

        <GlassCard className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={viewMode === 'day' ? 'primary' : 'ghost'}
                onClick={() => onViewModeChange('day')}
              >
                Day
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'week' ? 'primary' : 'ghost'}
                onClick={() => onViewModeChange('week')}
              >
                Week
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => moveRange(-1)}>
              Prev
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onDateChange(toYmd(new Date()))}>
              Today
            </Button>
            <Button size="sm" variant="secondary" onClick={() => moveRange(1)}>
              Next
            </Button>
            <a
              href="/app/calendar"
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs"
            >
              Open Calendar
            </a>
          </div>
        </GlassCard>
      </div>
    </header>
  )
}


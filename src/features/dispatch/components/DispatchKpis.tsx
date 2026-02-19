import { GlassCard } from '../../../components/ui'

type DispatchKpisProps = {
  unassignedCount: number
  assignedCount: number
  activeCleaners: number
}

function KpiCard({
  label,
  value,
  accentClass,
}: {
  label: string
  value: number
  accentClass: string
}) {
  return (
    <GlassCard className={`p-4 border ${accentClass}`}>
      <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
    </GlassCard>
  )
}

export function DispatchKpis({
  unassignedCount,
  assignedCount,
  activeCleaners,
}: DispatchKpisProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      <KpiCard
        label="Needs Assignment"
        value={unassignedCount}
        accentClass="border-amber-400/30"
      />
      <KpiCard
        label="Already Assigned"
        value={assignedCount}
        accentClass="border-emerald-400/30"
      />
      <KpiCard
        label="Active Cleaners"
        value={activeCleaners}
        accentClass="border-cyan-400/30"
      />
    </div>
  )
}


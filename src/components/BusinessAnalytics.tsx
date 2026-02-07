import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { GlassCard, Button, Skeleton, Badge } from './ui'
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
  parseISO,
} from 'date-fns'

type QuoteRecord = {
  id: string
  lead_id: string | null
  total_inc_gst: number
  profit: number
  cleaner_pay: number
  margin: number
  accepted_payment_method: string | null
  created_at: string
  lead?: {
    status?: string | null
  }
}

type LeadRecord = {
  id: string
  status: string | null
  created_at: string
  first_contact: string | number | null
}

type BookingOccurrence = {
  id: string
  status: string
  payment_status: string
  payment_amount_cents: number | null
  start_at: string
  created_at: string
}

type MonthlyData = {
  month: string
  monthLabel: string
  leads: number
  quotes: number
  quotedLeads: number
  wonJobs: number
  paidJobs: number
  totalQuoteValue: number
  combinedQuoteCount: number
  combinedQuoteValue: number
  combinedAvgQuoteValue: number
  wonValue: number
  paidValue: number
  totalProfit: number
  salesTotal: number
  salesExpenses: number
  salesProfit: number
  avgQuoteValue: number
  avgLeadToCall: number
  conversionRate: number
  quoteToWonRate: number
  completedJobs: number
  completedRevenue: number
}

type ProjectionScenario = {
  label: string
  adSpend: number
  leads: number
  quotes: number
  wonJobs: number
  revenue: number
  salesTotal: number
  salesExpenses: number
  salesProfit: number
  profit: number
  roi: number
  cac: number
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const date = subMonths(new Date(), i)
  return {
    value: format(date, 'yyyy-MM'),
    label: format(date, 'MMMM yyyy'),
  }
})

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-AU').format(Math.round(value))
}

function parseTimestamp(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    const ms = value > 1e10 ? value : value * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function getGrowthIndicator(current: number, previous: number) {
  if (!previous || previous === 0) return { value: 0, isUp: true, label: 'N/A' }
  const growth = ((current - previous) / previous) * 100
  return {
    value: Math.abs(growth),
    isUp: growth >= 0,
    label: `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`,
  }
}

// Mini sparkline component with glass styling
function Sparkline({ data, color = 'cyan' }: { data: number[]; color?: string }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const width = 100
  const height = 36
  const padding = 4

  const points = data
    .map((val, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2)
      const y = height - padding - ((val - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  const colorMap: Record<string, { stroke: string; fill: string }> = {
    cyan: { stroke: 'var(--color-primary)', fill: 'var(--color-primary)' },
    emerald: { stroke: '#34d399', fill: '#34d399' },
    violet: { stroke: '#a78bfa', fill: '#a78bfa' },
    amber: { stroke: '#fbbf24', fill: '#fbbf24' },
    rose: { stroke: '#fb7185', fill: '#fb7185' },
    indigo: { stroke: '#818cf8', fill: '#818cf8' },
    teal: { stroke: '#2dd4bf', fill: '#2dd4bf' },
  }

  const colors = colorMap[color] || colorMap.cyan

  // Create area fill path
  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`

  return (
    <svg width={width} height={height} className="opacity-90">
      <defs>
        <linearGradient id={`sparkGrad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.fill} stopOpacity="0.3" />
          <stop offset="100%" stopColor={colors.fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#sparkGrad-${color})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={colors.stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// KPI metric card with glass styling
function MetricCardLarge({
  title,
  value,
  subtitle,
  growth,
  sparkData,
  color = 'cyan',
  icon,
}: {
  title: string
  value: string
  subtitle?: string
  growth?: { value: number; isUp: boolean; label: string }
  sparkData?: number[]
  color?: string
  icon?: React.ReactNode
}) {
  const accentMap: Record<string, string> = {
    cyan: 'from-cyan-500/10 to-cyan-600/5 border-cyan-500/20',
    emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
    violet: 'from-violet-500/10 to-violet-600/5 border-violet-500/20',
    amber: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
    rose: 'from-rose-500/10 to-rose-600/5 border-rose-500/20',
    indigo: 'from-indigo-500/10 to-indigo-600/5 border-indigo-500/20',
    teal: 'from-teal-500/10 to-teal-600/5 border-teal-500/20',
  }

  const textMap: Record<string, string> = {
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    violet: 'text-violet-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    indigo: 'text-indigo-300',
    teal: 'text-teal-300',
  }

  const iconBgMap: Record<string, string> = {
    cyan: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
    emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    violet: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
    amber: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    rose: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
    indigo: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
    teal: 'bg-teal-500/15 border-teal-500/30 text-teal-300',
  }

  return (
    <div className={`glass-card rounded-2xl bg-gradient-to-br ${accentMap[color]} p-5 flex flex-col justify-between min-h-[160px] group hover:scale-[1.02] transition-all duration-300`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <div className={`w-10 h-10 rounded-xl ${iconBgMap[color]} border flex items-center justify-center transition-transform group-hover:scale-110`}>
              {icon}
            </div>
          )}
          <p className="text-sm text-[var(--color-text-secondary)] font-medium">{title}</p>
        </div>
        {growth && growth.label !== 'N/A' && (
          <Badge variant={growth.isUp ? 'success' : 'error'} className="text-[10px]">
            {growth.isUp ? '↑' : '↓'} {growth.label}
          </Badge>
        )}
      </div>
      <div className="flex items-end justify-between mt-3">
        <div>
          <p className={`text-3xl font-bold ${textMap[color]} tracking-tight`}>{value}</p>
          {subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</p>}
        </div>
        {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={color} />}
      </div>
    </div>
  )
}

// Funnel visualization with glass styling
function FunnelChart({
  stages,
}: {
  stages: { label: string; value: number; color: string; rate?: string }[]
}) {
  const maxValue = Math.max(...stages.map((s) => s.value), 1)

  return (
    <div className="space-y-4">
      {stages.map((stage, i) => {
        const widthPercent = (stage.value / maxValue) * 100
        return (
          <div key={stage.label} className="relative group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[var(--color-text-secondary)] font-medium">{stage.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-white tabular-nums">{formatNumber(stage.value)}</span>
                {stage.rate && (
                  <Badge variant="default" className="text-[10px]">{stage.rate}</Badge>
                )}
              </div>
            </div>
            <div className="h-10 rounded-xl bg-white/5 backdrop-blur-sm overflow-hidden border border-white/5">
              <div
                className={`h-full ${stage.color} transition-all duration-700 ease-out rounded-xl flex items-center justify-end pr-4 relative overflow-hidden group-hover:brightness-110`}
                style={{ width: `${Math.max(widthPercent, 5)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                {widthPercent > 15 && (
                  <span className="text-xs font-semibold text-white/90 relative z-10">
                    {formatPercent(widthPercent)}
                  </span>
                )}
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className="flex justify-center my-2">
                <svg className="w-5 h-5 text-white/20" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Bar chart for MoM comparison with glass styling
function BarChart({
  data,
  valueKey,
  labelKey,
  color = 'cyan',
  formatValue = formatNumber,
}: {
  data: { [key: string]: any }[]
  valueKey: string
  labelKey: string
  color?: string
  formatValue?: (v: number) => string
}) {
  const maxValue = Math.max(...data.map((d) => d[valueKey] || 0), 1)

  const colorMap: Record<string, string> = {
    cyan: 'bg-gradient-to-t from-cyan-500/60 to-cyan-400/80',
    emerald: 'bg-gradient-to-t from-emerald-500/60 to-emerald-400/80',
    violet: 'bg-gradient-to-t from-violet-500/60 to-violet-400/80',
    amber: 'bg-gradient-to-t from-amber-500/60 to-amber-400/80',
    indigo: 'bg-gradient-to-t from-indigo-500/60 to-indigo-400/80',
  }

  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((item, i) => {
        const heightPercent = ((item[valueKey] || 0) / maxValue) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
            <div className="relative w-full flex justify-center">
              <span className="absolute -top-6 text-[10px] text-white/60 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-medium">
                {formatValue(item[valueKey] || 0)}
              </span>
              <div
                className={`w-full max-w-[40px] ${colorMap[color]} rounded-t-lg transition-all duration-500 ease-out group-hover:brightness-125 relative overflow-hidden`}
                style={{ height: `${Math.max(heightPercent, 4)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-[10px] text-white/50 truncate max-w-full font-medium">
              {item[labelKey]?.slice(0, 3)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Mini stat card for detailed metrics
function MiniStatCard({ 
  title, 
  value, 
  subtitle, 
  color = 'white' 
}: { 
  title: string
  value: string | number
  subtitle?: string
  color?: string
}) {
  const textColorMap: Record<string, string> = {
    white: 'text-white',
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    violet: 'text-violet-300',
    teal: 'text-teal-300',
    rose: 'text-rose-300',
    indigo: 'text-indigo-300',
  }
  
  return (
    <div className="glass-card rounded-xl p-4 hover:bg-white/10 transition-colors group">
      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{title}</p>
      <p className={`text-2xl font-bold ${textColorMap[color]} mt-1 group-hover:scale-105 transition-transform origin-left`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</p>}
    </div>
  )
}

export default function BusinessAnalytics() {
  const { currentOrg } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value)
  const [compareMonth, setCompareMonth] = useState(MONTH_OPTIONS[1]?.value || MONTH_OPTIONS[0].value)
  const [adSpend, setAdSpend] = useState(1000)
  const [salesLift, setSalesLift] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Raw data
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [occurrences, setOccurrences] = useState<BookingOccurrence[]>([])

  // Calculated monthly data
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setError(null)
      setIsLoading(true)

      // Get data for last 12 months
      const lookbackStart = startOfMonth(subMonths(new Date(), 11))

      const [quotesRes, leadsRes, occurrencesRes] = await Promise.all([
        supabase
          .from('quotes')
          .select(
            `
            id, lead_id, total_inc_gst, profit, cleaner_pay, margin,
            accepted_payment_method, created_at,
            lead:extracted_leads (status)
          `
          )
          .eq('org_id', currentOrg!.id)
          .gte('created_at', lookbackStart.toISOString())
          .is('base_quote_id', null)
          .order('created_at', { ascending: false }),

        supabase
          .from('extracted_leads')
          .select('id, status, created_at, first_contact')
          .eq('org_id', currentOrg!.id)
          .gte('created_at', lookbackStart.toISOString())
          .order('created_at', { ascending: false }),

        supabase
          .from('booking_occurrences')
          .select('id, status, payment_status, payment_amount_cents, start_at, created_at')
          .eq('org_id', currentOrg!.id)
          .gte('start_at', lookbackStart.toISOString())
          .order('start_at', { ascending: false }),
      ])

      if (quotesRes.error) throw quotesRes.error
      if (leadsRes.error) throw leadsRes.error
      if (occurrencesRes.error) throw occurrencesRes.error

      setQuotes((quotesRes.data || []) as QuoteRecord[])
      setLeads(leadsRes.data || [])
      setOccurrences(occurrencesRes.data || [])
    } catch (err) {
      console.error('Failed to fetch analytics data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Calculate monthly data whenever raw data changes
  useEffect(() => {
    if (!quotes.length && !leads.length && !occurrences.length) {
      setMonthlyData([])
      return
    }

    const months = MONTH_OPTIONS.map((opt) => {
      const [year, month] = opt.value.split('-').map(Number)
      const monthStart = new Date(year, month - 1, 1)
      const monthEnd = endOfMonth(monthStart)

      // Filter data for this month
      const monthQuotes = quotes.filter((q) => {
        const d = parseISO(q.created_at)
        return d >= monthStart && d <= monthEnd
      })

      const monthLeads = leads.filter((l) => {
        const d = parseISO(l.created_at)
        return d >= monthStart && d <= monthEnd
      })

      const monthOccurrences = occurrences.filter((o) => {
        const d = parseISO(o.start_at)
        return d >= monthStart && d <= monthEnd
      })

      // Calculate metrics
      const totalLeads = monthLeads.length
      const totalQuotes = monthQuotes.length

      // Leads that got quoted
      const quotedLeadIds = new Set(monthQuotes.filter((q) => q.lead_id).map((q) => q.lead_id))
      const quotedLeads = quotedLeadIds.size

      // Won jobs (quotes with accepted payment or lead status marked as won/completed)
      const wonStatuses = new Set(['Job Won', 'Jobs Completed', 'Won'])
      const wonQuotes = monthQuotes.filter((q) => {
        const leadStatus = (q.lead as any)?.status
        return q.accepted_payment_method || (leadStatus && wonStatuses.has(leadStatus))
      })
      const wonJobs = wonQuotes.length
      const wonValue = wonQuotes.reduce((sum, q) => sum + (q.total_inc_gst || 0), 0)
      const totalProfit = wonQuotes.reduce((sum, q) => sum + (q.profit || 0), 0)
      const profitMargin = wonValue > 0 ? totalProfit / wonValue : 0

      // Paid jobs
      const paidOccurrences = monthOccurrences.filter((o) => o.payment_status === 'paid')
      const paidJobs = paidOccurrences.length
      const paidValue = paidOccurrences.reduce((sum, o) => sum + (o.payment_amount_cents || 0) / 100, 0)

      // Completed jobs
      const completedOccurrences = monthOccurrences.filter((o) => o.status === 'completed')
      const completedJobs = completedOccurrences.length
      const completedRevenue = completedOccurrences.reduce(
        (sum, o) => sum + (o.payment_amount_cents || 0) / 100,
        0
      )

      // Quote value
      const totalQuoteValue = monthQuotes.reduce((sum, q) => sum + (q.total_inc_gst || 0), 0)
      const avgQuoteValue = totalQuotes > 0 ? totalQuoteValue / totalQuotes : 0

      // Lead to call time
      const leadTimes = monthLeads
        .map((l) => {
          const created = parseTimestamp(l.created_at)
          const firstContact = parseTimestamp(l.first_contact)
          if (!created || !firstContact) return null
          const diffMinutes = (firstContact.getTime() - created.getTime()) / (1000 * 60)
          return Number.isFinite(diffMinutes) ? diffMinutes : null
        })
        .filter((t): t is number => t !== null && t >= 0 && t <= 60 * 24 * 7) // within 7 days

      const avgLeadToCall = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0

      // Conversion rates
      const conversionRate = totalLeads > 0 ? (wonJobs / totalLeads) * 100 : 0
      const quoteToWonRate = totalQuotes > 0 ? (wonJobs / totalQuotes) * 100 : 0
      const combinedQuoteCount = totalQuotes
      const combinedQuoteValue = totalQuoteValue
      const combinedAvgQuoteValue = avgQuoteValue
      const salesTotal = paidValue > 0 ? paidValue : completedRevenue > 0 ? completedRevenue : wonValue
      const salesExpenses = salesTotal * (1 - profitMargin)
      const salesProfit = salesTotal - salesExpenses

      return {
        month: opt.value,
        monthLabel: opt.label,
        leads: totalLeads,
        quotes: totalQuotes,
        quotedLeads,
        wonJobs,
        paidJobs,
        totalQuoteValue,
        combinedQuoteCount,
        combinedQuoteValue,
        combinedAvgQuoteValue,
        wonValue,
        paidValue,
        totalProfit,
        salesTotal,
        salesExpenses,
        salesProfit,
        avgQuoteValue,
        avgLeadToCall,
        conversionRate,
        quoteToWonRate,
        completedJobs,
        completedRevenue,
      }
    })

    setMonthlyData(months)
  }, [quotes, leads, occurrences])

  // Get current and compare month data
  const currentMonthData = useMemo(
    () => monthlyData.find((d) => d.month === selectedMonth),
    [monthlyData, selectedMonth]
  )

  const compareMonthData = useMemo(
    () => monthlyData.find((d) => d.month === compareMonth),
    [monthlyData, compareMonth]
  )

  // Funnel stages for visualization
  const funnelStages = useMemo(() => {
    if (!currentMonthData) return []
    return [
      {
        label: 'Total Leads',
        value: currentMonthData.leads,
        color: 'bg-gradient-to-r from-violet-500 to-violet-400',
      },
      {
        label: 'Quoted',
        value: currentMonthData.quotedLeads,
        color: 'bg-gradient-to-r from-indigo-500 to-indigo-400',
        rate: currentMonthData.leads > 0 ? `${((currentMonthData.quotedLeads / currentMonthData.leads) * 100).toFixed(0)}%` : '0%',
      },
      {
        label: 'Won Jobs',
        value: currentMonthData.wonJobs,
        color: 'bg-gradient-to-r from-cyan-500 to-cyan-400',
        rate: currentMonthData.quotedLeads > 0 ? `${((currentMonthData.wonJobs / currentMonthData.quotedLeads) * 100).toFixed(0)}%` : '0%',
      },
      {
        label: 'Paid',
        value: currentMonthData.paidJobs,
        color: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
        rate: currentMonthData.wonJobs > 0 ? `${((currentMonthData.paidJobs / currentMonthData.wonJobs) * 100).toFixed(0)}%` : '0%',
      },
    ]
  }, [currentMonthData])

  // Unit economics calculations
  const unitEconomics = useMemo(() => {
    if (!currentMonthData || currentMonthData.leads === 0) {
      return { cac: 0, ltv: 0, ltvCacRatio: 0, profitPerLead: 0 }
    }

    const cac = currentMonthData.wonJobs > 0 ? adSpend / currentMonthData.wonJobs : adSpend
    const avgJobValue = currentMonthData.wonJobs > 0 ? currentMonthData.wonValue / currentMonthData.wonJobs : 0
    const ltv = avgJobValue * 3 // Estimate 3x for lifetime value
    const ltvCacRatio = cac > 0 ? ltv / cac : 0
    const profitPerLead = currentMonthData.leads > 0 ? currentMonthData.totalProfit / currentMonthData.leads : 0

    return { cac, ltv, ltvCacRatio, profitPerLead }
  }, [currentMonthData, adSpend])

  // Projections for scaling
  const projections = useMemo((): ProjectionScenario[] => {
    if (!currentMonthData || currentMonthData.leads === 0) {
      return []
    }

    const costPerLead = adSpend > 0 ? adSpend / currentMonthData.leads : 50 // default $50 CPL
    const quoteRate = currentMonthData.quotedLeads / currentMonthData.leads
    const closeRate = currentMonthData.quotedLeads > 0 ? currentMonthData.wonJobs / currentMonthData.quotedLeads : 0
    const avgJobValue = currentMonthData.wonJobs > 0 ? currentMonthData.wonValue / currentMonthData.wonJobs : 400
    const profitMargin = currentMonthData.wonValue > 0 ? currentMonthData.totalProfit / currentMonthData.wonValue : 0
    const salesTotalMultiplier =
      currentMonthData.wonValue > 0 ? currentMonthData.salesTotal / currentMonthData.wonValue : 1

    const scenarios = [
      { label: 'Current', spend: adSpend },
      { label: '2x Growth', spend: adSpend * 2 },
      { label: '3x Growth', spend: adSpend * 3 },
      { label: '5x Growth', spend: adSpend * 5 },
      { label: '10x Growth', spend: adSpend * 10 },
    ]

    return scenarios.map(({ label, spend }) => {
      const estLeads = costPerLead > 0 ? spend / costPerLead : 0
      const estQuotes = estLeads * quoteRate
      const estWon = estQuotes * closeRate
      const revenue = estWon * avgJobValue
      const salesTotal = revenue * salesTotalMultiplier * salesLift
      const salesExpenses = salesTotal * (1 - profitMargin)
      const salesProfit = salesTotal - salesExpenses
      const profit = salesProfit
      const roi = spend > 0 ? (profit / spend) * 100 : 0
      const cac = estWon > 0 ? spend / estWon : spend

      return {
        label,
        adSpend: spend,
        leads: estLeads,
        quotes: estQuotes,
        wonJobs: estWon,
        revenue,
        salesTotal,
        salesExpenses,
        salesProfit,
        profit,
        roi,
        cac,
      }
    })
  }, [currentMonthData, adSpend, salesLift])

  // Sparkline data
  const sparkDataLeads = useMemo(
    () => monthlyData.slice(0, 6).reverse().map((d) => d.leads),
    [monthlyData]
  )
  const sparkDataRevenue = useMemo(
    () => monthlyData.slice(0, 6).reverse().map((d) => d.wonValue),
    [monthlyData]
  )
  const sparkDataProfit = useMemo(
    () => monthlyData.slice(0, 6).reverse().map((d) => d.totalProfit),
    [monthlyData]
  )
  const sparkDataConversion = useMemo(
    () => monthlyData.slice(0, 6).reverse().map((d) => d.conversionRate),
    [monthlyData]
  )

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-[1600px] mx-auto space-y-8">
          {/* Header skeleton */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-11 w-40" />
              <Skeleton className="h-11 w-40" />
              <Skeleton className="h-11 w-28" />
            </div>
          </div>
          
          {/* Metrics skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
          
          {/* Charts skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!currentOrg) return null

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-400/30 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              Business Analytics
            </h1>
            <p className="text-[var(--color-text-muted)] mt-2 text-sm max-w-lg">
              Deep-dive into your business performance with projections and scaling analysis
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Month selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Primary</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-4 py-2.5 rounded-xl glass-card text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 cursor-pointer"
              >
                {MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-800">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Compare</label>
              <select
                value={compareMonth}
                onChange={(e) => setCompareMonth(e.target.value)}
                className="px-4 py-2.5 rounded-xl glass-card text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 cursor-pointer"
              >
                {MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-800">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              onClick={fetchData}
              variant="primary"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            >
              Refresh
            </Button>
          </div>
        </header>

        {error && (
          <GlassCard className="p-4 border-rose-500/30 bg-rose-500/10">
            <div className="flex items-center gap-3 text-rose-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          </GlassCard>
        )}

        {/* Key Metrics Grid */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Key Performance Indicators
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCardLarge
              title="Total Leads"
              value={formatNumber(currentMonthData?.leads || 0)}
              subtitle={`${formatNumber(compareMonthData?.leads || 0)} prev month`}
              growth={getGrowthIndicator(currentMonthData?.leads || 0, compareMonthData?.leads || 0)}
              sparkData={sparkDataLeads}
              color="violet"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
            />
            <MetricCardLarge
              title="Revenue (Won)"
              value={formatCurrency(currentMonthData?.wonValue || 0)}
              subtitle={`${formatCurrency(compareMonthData?.wonValue || 0)} prev month`}
              growth={getGrowthIndicator(currentMonthData?.wonValue || 0, compareMonthData?.wonValue || 0)}
              sparkData={sparkDataRevenue}
              color="emerald"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCardLarge
              title="Gross Profit"
              value={formatCurrency(currentMonthData?.totalProfit || 0)}
              subtitle={`${formatCurrency(compareMonthData?.totalProfit || 0)} prev month`}
              growth={getGrowthIndicator(currentMonthData?.totalProfit || 0, compareMonthData?.totalProfit || 0)}
              sparkData={sparkDataProfit}
              color="teal"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
            <MetricCardLarge
              title="Conversion Rate"
              value={formatPercent(currentMonthData?.conversionRate || 0)}
              subtitle={`${formatPercent(compareMonthData?.conversionRate || 0)} prev month`}
              growth={getGrowthIndicator(currentMonthData?.conversionRate || 0, compareMonthData?.conversionRate || 0)}
              sparkData={sparkDataConversion}
              color="cyan"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
          </div>
        </section>

        {/* Sales Snapshot */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            Sales Snapshot
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MiniStatCard
              title="Paid Revenue (Month)"
              value={formatCurrency(currentMonthData?.salesTotal || 0)}
              subtitle="Collected this month"
              color="emerald"
            />
            <MiniStatCard
              title="Sales Expenses (Est.)"
              value={formatCurrency(currentMonthData?.salesExpenses || 0)}
              subtitle="Based on sales mix"
              color="amber"
            />
            <MiniStatCard
              title="Sales Profit (Est.)"
              value={formatCurrency(currentMonthData?.salesProfit || 0)}
              subtitle="Based on sales"
              color="teal"
            />
          </div>
        </section>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Funnel */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-violet-400" />
              Sales Funnel Analysis
            </h2>
            <FunnelChart stages={funnelStages} />
            <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 gap-6">
              <div className="text-center">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Quote Rate</p>
                <p className="text-3xl font-bold text-white">
                  {currentMonthData && currentMonthData.leads > 0
                    ? formatPercent((currentMonthData.quotedLeads / currentMonthData.leads) * 100)
                    : '0%'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Close Rate</p>
                <p className="text-3xl font-bold text-white">
                  {formatPercent(currentMonthData?.quoteToWonRate || 0)}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Unit Economics */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              Unit Economics
            </h2>

            {/* Ad Spend Input */}
            <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <label className="flex items-center justify-between text-sm text-[var(--color-text-secondary)] mb-3">
                <span className="font-medium">Monthly Ad Spend</span>
                <span className="text-xl font-bold text-amber-300">{formatCurrency(adSpend)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="10000"
                step="100"
                value={adSpend}
                onChange={(e) => setAdSpend(Number(e.target.value))}
                className="w-full h-2 rounded-full bg-white/10 appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-2">
                <span>$0</span>
                <span>$5,000</span>
                <span>$10,000</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <MiniStatCard
                title="CAC"
                value={formatCurrency(unitEconomics.cac)}
                subtitle="Cost to acquire"
                color="amber"
              />
              <MiniStatCard
                title="LTV (Est.)"
                value={formatCurrency(unitEconomics.ltv)}
                subtitle="Lifetime value"
                color="emerald"
              />
              <MiniStatCard
                title="LTV:CAC Ratio"
                value={`${unitEconomics.ltvCacRatio.toFixed(1)}x`}
                subtitle={unitEconomics.ltvCacRatio >= 3 ? 'Healthy' : unitEconomics.ltvCacRatio >= 1 ? 'Break-even' : 'Needs work'}
                color={unitEconomics.ltvCacRatio >= 3 ? 'emerald' : unitEconomics.ltvCacRatio >= 1 ? 'amber' : 'rose'}
              />
              <MiniStatCard
                title="Profit/Lead"
                value={formatCurrency(unitEconomics.profitPerLead)}
                subtitle="Avg per lead"
                color="teal"
              />
            </div>
          </GlassCard>
        </div>

        {/* Scaling Projections */}
        <GlassCard className="p-6 border-indigo-500/20 bg-gradient-to-br from-indigo-900/20 to-violet-900/20">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Scaling Projections
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            What happens when you scale your ad spend? Based on current conversion rates.
          </p>

          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <label className="flex items-center justify-between text-sm text-[var(--color-text-secondary)] mb-3">
              <span className="font-medium">Sales Multiplier (same ad spend)</span>
              <span className="text-xl font-bold text-indigo-300">{salesLift.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={salesLift}
              onChange={(e) => setSalesLift(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-white/10 appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-2">
              <span>0.5x</span>
              <span>1x</span>
              <span>2x</span>
              <span>3x</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Scenario</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Ad Spend</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Est. Leads</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Est. Quotes</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Est. Won</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Est. Total Sales</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Est. Total Expenses</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Est. Profit</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">ROI</th>
                  <th className="text-right py-4 px-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium">CAC</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((proj) => (
                  <tr
                    key={proj.label}
                    className={`border-b border-white/5 transition-colors hover:bg-white/5 ${proj.label === 'Current' ? 'bg-indigo-500/10' : ''}`}
                  >
                    <td className="py-4 px-4">
                      <span className={`text-sm font-medium ${proj.label === 'Current' ? 'text-indigo-300' : 'text-white'}`}>
                        {proj.label}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-[var(--color-text-secondary)] tabular-nums">{formatCurrency(proj.adSpend)}</td>
                    <td className="py-4 px-4 text-right text-sm text-[var(--color-text-secondary)] tabular-nums">{formatNumber(proj.leads)}</td>
                    <td className="py-4 px-4 text-right text-sm text-[var(--color-text-secondary)] tabular-nums">{formatNumber(proj.quotes)}</td>
                    <td className="py-4 px-4 text-right text-sm text-[var(--color-text-secondary)] tabular-nums">{formatNumber(proj.wonJobs)}</td>
                    <td className="py-4 px-4 text-right text-sm text-emerald-300 font-medium tabular-nums">{formatCurrency(proj.salesTotal)}</td>
                    <td className="py-4 px-4 text-right text-sm text-[var(--color-text-secondary)] tabular-nums">
                      {formatCurrency(proj.salesExpenses)}
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-emerald-300 font-medium tabular-nums">
                      {formatCurrency(proj.salesProfit)}
                    </td>
                    <td className={`py-4 px-4 text-right text-sm font-medium tabular-nums ${proj.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatCurrency(proj.profit)}
                    </td>
                    <td className={`py-4 px-4 text-right text-sm font-medium tabular-nums ${proj.roi >= 100 ? 'text-emerald-300' : proj.roi >= 0 ? 'text-amber-300' : 'text-rose-300'}`}>
                      {formatPercent(proj.roi)}
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-[var(--color-text-secondary)] tabular-nums">{formatCurrency(proj.cac)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Month over Month Comparison */}
        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            Month-over-Month Trends
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-4 font-medium">Leads Trend</p>
              <BarChart
                data={monthlyData.slice(0, 6).reverse()}
                valueKey="leads"
                labelKey="monthLabel"
                color="violet"
              />
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-4 font-medium">Revenue Trend</p>
              <BarChart
                data={monthlyData.slice(0, 6).reverse()}
                valueKey="wonValue"
                labelKey="monthLabel"
                color="emerald"
                formatValue={formatCurrency}
              />
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-4 font-medium">Jobs Won Trend</p>
              <BarChart
                data={monthlyData.slice(0, 6).reverse()}
                valueKey="wonJobs"
                labelKey="monthLabel"
                color="cyan"
              />
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-4 font-medium">Conversion Rate Trend</p>
              <BarChart
                data={monthlyData.slice(0, 6).reverse()}
                valueKey="conversionRate"
                labelKey="monthLabel"
                color="amber"
                formatValue={(v) => `${v.toFixed(1)}%`}
              />
            </div>
          </div>
        </GlassCard>

        {/* Detailed Metrics Grid */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-teal-400" />
            Detailed Monthly Metrics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStatCard
              title="Total Quotes"
              value={currentMonthData?.combinedQuoteCount || 0}
              subtitle="Quoted (incl. won/completed)"
            />
            <MiniStatCard
              title="Quote Value"
              value={formatCurrency(currentMonthData?.combinedQuoteValue || 0)}
              subtitle="Quoted (incl. won/completed)"
              color="indigo"
            />
            <MiniStatCard
              title="Avg Quote"
              value={formatCurrency(currentMonthData?.combinedAvgQuoteValue || 0)}
              subtitle="Quoted (incl. won/completed)"
            />
            <MiniStatCard
              title="Won Jobs"
              value={currentMonthData?.wonJobs || 0}
              subtitle="Closed deals"
              color="emerald"
            />
            <MiniStatCard
              title="Completed"
              value={currentMonthData?.completedJobs || 0}
              subtitle="Jobs finished"
              color="teal"
            />
            <MiniStatCard
              title="Avg Lead→Call"
              value={currentMonthData?.avgLeadToCall ? `${currentMonthData.avgLeadToCall.toFixed(0)}m` : 'N/A'}
              subtitle="Response time"
              color="amber"
            />
          </div>
        </section>

        {/* Performance Summary */}
        <GlassCard className="p-6 border-emerald-500/20 bg-gradient-to-br from-emerald-900/15 to-teal-900/15">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            Performance Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Revenue Performance</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {currentMonthData && compareMonthData
                    ? currentMonthData.wonValue >= compareMonthData.wonValue
                      ? `Up ${formatCurrency(currentMonthData.wonValue - compareMonthData.wonValue)} vs last period`
                      : `Down ${formatCurrency(compareMonthData.wonValue - currentMonthData.wonValue)} vs last period`
                    : 'Comparing month data...'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Lead Quality</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {currentMonthData
                    ? `${formatPercent(currentMonthData.conversionRate)} of leads convert to won jobs`
                    : 'Calculating...'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Profitability</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {currentMonthData && currentMonthData.wonValue > 0
                    ? `${formatPercent((currentMonthData.totalProfit / currentMonthData.wonValue) * 100)} profit margin on won jobs`
                    : 'Calculating...'}
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Footer */}
        <footer className="text-center text-[var(--color-text-muted)] text-sm pt-8 border-t border-white/5">
          <p className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Business Analytics Dashboard • Data refreshed in real-time
          </p>
        </footer>
      </div>
    </div>
  )
}

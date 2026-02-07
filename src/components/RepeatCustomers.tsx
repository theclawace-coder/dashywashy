import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Lead = {
  id: string
  name?: string | null
  phone_number?: string | null
  email?: string | null
  status?: string | null
  created_at?: string | null
}

type SeriesSummary = {
  id: string
  starts_at: string
  rrule: string | null
  status: string
  monthlyRevenue: number
}

type RepeatCustomer = {
  lead: Lead
  seriesCount: number
  monthlyRevenue: number
  firstBooking?: string
  lastBooking?: string
  bookingSeries: SeriesSummary[]
}

type QuoteRecord = {
  id: string
  lead_id: string | null
  total_inc_gst: number | null
  created_at?: string | null
}

function parseRRule(rrule: string | null) {
  if (!rrule) return null
  const parts: Record<string, string> = {}
  rrule.split(';').forEach((part) => {
    const [key, value] = part.split('=')
    if (key && value) parts[key] = value
  })
  return {
    freq: parts['FREQ'] || null,
    interval: parseInt(parts['INTERVAL'] || '1', 10),
  }
}

function rruleToLabel(rrule: string | null) {
  const parsed = parseRRule(rrule)
  if (!parsed?.freq) return 'One-time'
  if (parsed.freq === 'WEEKLY') {
    if (parsed.interval === 1) return 'Weekly'
    if (parsed.interval === 2) return 'Fortnightly'
    if (parsed.interval === 3) return 'Every 3 weeks'
    return `Every ${parsed.interval} weeks`
  }
  if (parsed.freq === 'MONTHLY') {
    if (parsed.interval === 1) return 'Monthly'
    if (parsed.interval === 2) return 'Every 2 months'
    return `Every ${parsed.interval} months`
  }
  return 'Repeats'
}

function formatDayLabel(startsAt: string) {
  const date = new Date(startsAt)
  if (Number.isNaN(date.getTime())) return 'Unknown day'
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

function generateOccurrencesUntil(
  startDate: Date,
  rrule: string | null,
  untilDate: Date,
  maxCount: number
) {
  const dates: Date[] = [new Date(startDate)]
  if (!rrule) return dates

  const parsed = parseRRule(rrule)
  if (!parsed?.freq) return dates

  let currentDate = new Date(startDate)
  while (dates.length < maxCount) {
    if (parsed.freq === 'WEEKLY') {
      currentDate = new Date(currentDate.getTime() + parsed.interval * 7 * 24 * 60 * 60 * 1000)
    } else if (parsed.freq === 'MONTHLY') {
      const nextMonth = new Date(currentDate)
      nextMonth.setMonth(nextMonth.getMonth() + parsed.interval)
      currentDate = nextMonth
    } else {
      break
    }

    if (currentDate > untilDate) break
    dates.push(new Date(currentDate))
  }

  return dates
}

function countOccurrencesInMonth(startsAt: string, rrule: string | null, monthStart: Date, monthEnd: Date) {
  if (!rrule) return 0
  const startDate = new Date(startsAt)
  if (Number.isNaN(startDate.getTime())) return 0

  let effectiveMonthStart = monthStart
  let effectiveMonthEnd = monthEnd

  // If the series starts in a future month, use that month for "monthly" revenue.
  if (startDate > monthEnd) {
    effectiveMonthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 0, 0, 0, 0)
    effectiveMonthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999)
  }

  const occurrences = generateOccurrencesUntil(startDate, rrule, effectiveMonthEnd, 200)
  return occurrences.filter((date) => date >= effectiveMonthStart && date <= effectiveMonthEnd).length
}

export default function RepeatCustomers() {
  const { currentOrg } = useAuth()
  const [repeatCustomers, setRepeatCustomers] = useState<RepeatCustomer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'value' | 'bookings' | 'name'>('value')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchRepeatCustomers = async () => {
    try {
      setError(null)
      setIsLoading(true)

      if (!currentOrg) {
        setRepeatCustomers([])
        setIsLoading(false)
        return
      }

      // Fetch all booking series with their lead info
      const { data: bookingSeries, error: bookingError } = await supabase
        .from('booking_series')
        .select(`
          *,
          lead:extracted_leads (*)
        `)
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false })

      if (bookingError) throw bookingError

      // Fetch all quotes
      const { data: quotes, error: quotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false })

      if (quotesError) throw quotesError

      const quotesById = new Map<string, QuoteRecord>()
      const latestQuoteByLead = new Map<string, QuoteRecord>()

      for (const quote of (quotes || []) as QuoteRecord[]) {
        if (quote?.id) quotesById.set(quote.id, quote)
        if (!quote?.lead_id) continue
        const existing = latestQuoteByLead.get(quote.lead_id)
        if (!existing) {
          latestQuoteByLead.set(quote.lead_id, quote)
          continue
        }
        const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0
        const quoteTime = quote.created_at ? new Date(quote.created_at).getTime() : 0
        if (quoteTime >= existingTime) {
          latestQuoteByLead.set(quote.lead_id, quote)
        }
      }

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

      // Group by lead_id and count recurring schedules
      const leadMap = new Map<string, RepeatCustomer>()

      // Process booking series
      for (const booking of bookingSeries || []) {
        if (!booking.lead_id) continue
        if (!booking.rrule) continue

        const seriesQuote =
          (booking.quote_id ? quotesById.get(booking.quote_id) : null) ||
          latestQuoteByLead.get(booking.lead_id) ||
          null
        const quoteValue = seriesQuote?.total_inc_gst || 0
        const occurrencesThisMonth = countOccurrencesInMonth(booking.starts_at, booking.rrule, monthStart, monthEnd)
        const seriesMonthlyRevenue = quoteValue * occurrencesThisMonth

        const existing = leadMap.get(booking.lead_id)
        if (existing) {
          existing.seriesCount++
          existing.monthlyRevenue += seriesMonthlyRevenue
          existing.bookingSeries.push({
            id: booking.id,
            starts_at: booking.starts_at,
            rrule: booking.rrule || null,
            status: booking.status,
            monthlyRevenue: seriesMonthlyRevenue,
          })
          if (booking.starts_at) {
            if (!existing.firstBooking || new Date(booking.starts_at) < new Date(existing.firstBooking)) {
              existing.firstBooking = booking.starts_at
            }
            if (!existing.lastBooking || new Date(booking.starts_at) > new Date(existing.lastBooking)) {
              existing.lastBooking = booking.starts_at
            }
          }
        } else {
          leadMap.set(booking.lead_id, {
            lead: booking.lead || { id: booking.lead_id },
            seriesCount: 1,
            monthlyRevenue: seriesMonthlyRevenue,
            firstBooking: booking.starts_at,
            lastBooking: booking.starts_at,
            bookingSeries: [
              {
                id: booking.id,
                starts_at: booking.starts_at,
                rrule: booking.rrule || null,
                status: booking.status,
                monthlyRevenue: seriesMonthlyRevenue,
              },
            ],
          })
        }
      }

      // Filter to only customers with recurring schedules
      const repeats = Array.from(leadMap.values()).filter((c) => c.seriesCount > 0)

      setRepeatCustomers(repeats)
    } catch (err) {
      console.error('Error fetching repeat customers:', err)
      setError(err instanceof Error ? err.message : 'Failed to load repeat customers')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!currentOrg) return
    fetchRepeatCustomers()

    // Subscribe to changes
    const bookingChannel = supabase
      .channel('repeat_customers_bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_series', filter: 'org_id=eq.' + currentOrg.id },
        () => fetchRepeatCustomers()
      )
      .subscribe()

    const quotesChannel = supabase
      .channel('repeat_customers_quotes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes', filter: 'org_id=eq.' + currentOrg.id },
        () => fetchRepeatCustomers()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(bookingChannel)
      supabase.removeChannel(quotesChannel)
    }
  }, [currentOrg])

  const filteredCustomers = useMemo(() => {
    let result = repeatCustomers

    // Apply search
    if (search.trim()) {
      const term = search.toLowerCase()
      result = result.filter((c) => {
        const haystack = [c.lead.name, c.lead.email, c.lead.phone_number]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let comparison = 0
      if (sortBy === 'value') {
        comparison = a.monthlyRevenue - b.monthlyRevenue
      } else if (sortBy === 'bookings') {
        comparison = a.seriesCount - b.seriesCount
      } else if (sortBy === 'name') {
        const nameA = (a.lead.name || '').toLowerCase()
        const nameB = (b.lead.name || '').toLowerCase()
        comparison = nameA.localeCompare(nameB)
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [repeatCustomers, search, sortBy, sortOrder])

  const grandTotal = useMemo(() => {
    return repeatCustomers.reduce((sum, c) => sum + c.monthlyRevenue, 0)
  }, [repeatCustomers])

  const totalBookings = useMemo(() => {
    return repeatCustomers.reduce((sum, c) => sum + c.seriesCount, 0)
  }, [repeatCustomers])

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-400/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              Repeat Customers
            </h1>
            <p className="text-sm text-white/60 mt-1 ml-13">Customers with recurring schedules</p>
          </div>

          <button
            onClick={fetchRepeatCustomers}
            disabled={isLoading}
            className="self-start md:self-auto px-4 py-2 rounded-xl bg-violet-600/80 hover:bg-violet-600 text-white text-sm font-medium disabled:opacity-50 transition flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Total Value Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600/30 via-fuchsia-600/20 to-pink-600/30 border border-violet-400/30 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(192,132,252,0.15),transparent_50%)]" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-violet-200 uppercase tracking-wider">Total Monthly Recurring Revenue</span>
            </div>
            <p className="text-5xl font-black text-white tracking-tight">
              ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-white/50">Customers: </span>
                <span className="text-white font-semibold">{repeatCustomers.length}</span>
              </div>
              <div>
                <span className="text-white/50">Recurring Schedules: </span>
                <span className="text-white font-semibold">{totalBookings}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500/50"
          />

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split('-') as ['value' | 'bookings' | 'name', 'asc' | 'desc']
              setSortBy(by)
              setSortOrder(order)
            }}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none"
          >
            <option value="value-desc">Highest Monthly Revenue</option>
            <option value="value-asc">Lowest Monthly Revenue</option>
            <option value="bookings-desc">Most Schedules</option>
            <option value="bookings-asc">Fewest Schedules</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Customers List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-white/50">
            <svg className="w-6 h-6 animate-spin mr-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading repeat customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/50">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p>No recurring customers found</p>
            <p className="text-xs mt-1">Customers with repeat schedules will appear here</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredCustomers.map((customer, index) => {
              const lead = customer.lead
              const displayName = lead.name || 'Unknown Customer'
              const contact = lead.email || lead.phone_number || ''

              return (
                <a
                  key={lead.id}
                  href={`/?lead=${lead.id}`}
                  className="block rounded-xl bg-gradient-to-r from-slate-800/50 to-slate-900/50 border border-white/10 p-5 hover:border-violet-400/30 transition group"
                  aria-label={`Open ${displayName}`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Customer Info */}
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-400/30 flex items-center justify-center text-violet-200 font-bold text-lg">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-white font-semibold text-lg">{displayName}</h3>
                        {contact && <p className="text-sm text-white/50">{contact}</p>}
                        {lead.status && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white/10 text-white/70">
                            {lead.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-violet-300">{customer.seriesCount}</p>
                        <p className="text-xs text-white/50 uppercase tracking-wider">Schedules</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-white">
                          ${customer.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-white/50 uppercase tracking-wider">Monthly Revenue</p>
                      </div>
                    </div>
                  </div>

                  {/* Booking Timeline */}
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Recurring Schedule</p>
                    <div className="flex flex-wrap gap-2">
                      {customer.bookingSeries.slice(0, 6).map((booking) => (
                        <div
                          key={booking.id}
                          className={`px-3 py-1.5 rounded-lg text-xs ${
                            booking.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : booking.status === 'cancelled'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-white/10 text-white/70 border border-white/10'
                          }`}
                        >
                          <span className="font-medium">{formatDayLabel(booking.starts_at)}</span>
                          <span className="ml-2 opacity-60">{rruleToLabel(booking.rrule)}</span>
                          {booking.monthlyRevenue > 0 && (
                            <span className="ml-2 opacity-60">
                              ${booking.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
                            </span>
                          )}
                        </div>
                      ))}
                      {customer.bookingSeries.length > 6 && (
                        <span className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-white/40">
                          +{customer.bookingSeries.length - 6} more
                        </span>
                      )}
                    </div>
                    {customer.firstBooking && customer.lastBooking && (
                      <p className="mt-2 text-xs text-white/40">
                        First booking: {new Date(customer.firstBooking).toLocaleDateString()} · 
                        Latest: {new Date(customer.lastBooking).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type {
  BookingOccurrence,
  Cleaner,
  CleanerReviewStat,
  DispatchViewMode,
  QuotePin,
} from '../types'
import { addDays, startOfWeekMonday, toYmd } from '../types'

type UseDispatchBoardResult = {
  selectedDate: string
  setSelectedDate: (value: string) => void
  viewMode: DispatchViewMode
  setViewMode: (value: DispatchViewMode) => void
  jobs: BookingOccurrence[]
  cleaners: Cleaner[]
  quotePins: Record<string, QuotePin>
  reviewStats: Record<string, CleanerReviewStat>
  unassignedJobs: BookingOccurrence[]
  assignedJobs: BookingOccurrence[]
  selectedJobId: string | null
  setSelectedJobId: (value: string | null) => void
  selectedJob: BookingOccurrence | null
  rangeStart: Date
  rangeEnd: Date
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const STORAGE_DATE_KEY = 'dispatch-v2-date'
const STORAGE_VIEW_KEY = 'dispatch-v2-view'

function isValidViewMode(value: string | null): value is DispatchViewMode {
  return value === 'day' || value === 'week'
}

function parseInitialDate() {
  if (typeof window === 'undefined') return toYmd(new Date())
  const params = new URLSearchParams(window.location.search)
  const urlDate = params.get('date')
  const storedDate = (() => {
    try {
      return window.localStorage.getItem(STORAGE_DATE_KEY)
    } catch {
      return null
    }
  })()
  const candidate = urlDate || storedDate
  if (!candidate) return toYmd(new Date())
  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return toYmd(new Date())
  return toYmd(parsed)
}

function parseInitialViewMode(): DispatchViewMode {
  if (typeof window === 'undefined') return 'week'
  const params = new URLSearchParams(window.location.search)
  const urlView = params.get('view')
  const storedView = (() => {
    try {
      return window.localStorage.getItem(STORAGE_VIEW_KEY)
    } catch {
      return null
    }
  })()
  const candidate = urlView || storedView
  return isValidViewMode(candidate) ? candidate : 'week'
}

function sortByStartAscending(a: BookingOccurrence, b: BookingOccurrence) {
  return new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
}

function normalizeJobRow(row: any): BookingOccurrence {
  const rawSeries = Array.isArray(row?.series) ? row.series[0] : row?.series
  const rawLead = Array.isArray(rawSeries?.lead) ? rawSeries.lead[0] : rawSeries?.lead

  return {
    id: row?.id,
    series_id: row?.series_id,
    quote_id: row?.quote_id ?? null,
    start_at: row?.start_at,
    end_at: row?.end_at,
    status: row?.status,
    cleaner_id: row?.cleaner_id ?? null,
    notes: row?.notes ?? null,
    series: rawSeries
      ? {
          id: rawSeries.id,
          title: rawSeries.title,
          lead_id: rawSeries.lead_id,
          quote_id: rawSeries.quote_id ?? null,
          service_address: rawSeries.service_address ?? null,
          service_lat:
            typeof rawSeries.service_lat === 'number' ? rawSeries.service_lat : null,
          service_lng:
            typeof rawSeries.service_lng === 'number' ? rawSeries.service_lng : null,
          notes: rawSeries.notes ?? null,
          lead: rawLead ? { id: rawLead.id, name: rawLead.name ?? null } : undefined,
        }
      : undefined,
  }
}

export function useDispatchBoard(orgId: string | null | undefined): UseDispatchBoardResult {
  const [selectedDate, setSelectedDate] = useState<string>(() => parseInitialDate())
  const [viewMode, setViewMode] = useState<DispatchViewMode>(() => parseInitialViewMode())

  const [jobs, setJobs] = useState<BookingOccurrence[]>([])
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [quotePins, setQuotePins] = useState<Record<string, QuotePin>>({})
  const [reviewStats, setReviewStats] = useState<Record<string, CleanerReviewStat>>({})
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rangeStart = useMemo(() => {
    const baseDate = new Date(`${selectedDate}T00:00:00`)
    return viewMode === 'week' ? startOfWeekMonday(baseDate) : baseDate
  }, [selectedDate, viewMode])

  const rangeEnd = useMemo(() => {
    return viewMode === 'week' ? addDays(rangeStart, 7) : addDays(rangeStart, 1)
  }, [rangeStart, viewMode])

  const refresh = useCallback(async () => {
    if (!orgId) {
      setJobs([])
      setCleaners([])
      setQuotePins({})
      setReviewStats({})
      setSelectedJobId(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [
        { data: cleanersData, error: cleanersErr },
        { data: jobsData, error: jobsErr },
        { data: reviewRows, error: reviewErr },
      ] = await Promise.all([
        supabase
          .from('cleaners')
          .select('id, full_name, phone, base_location_text, base_lat, base_lng, active')
          .eq('org_id', orgId)
          .order('full_name'),
        supabase
          .from('booking_occurrences')
          .select(
            `id, series_id, quote_id, start_at, end_at, status, cleaner_id, notes,
             series:booking_series(id, title, lead_id, quote_id, service_address, service_lat, service_lng, notes, lead:extracted_leads(id, name))`
          )
          .eq('org_id', orgId)
          .gte('start_at', rangeStart.toISOString())
          .lt('start_at', rangeEnd.toISOString())
          .neq('status', 'cancelled')
          .order('start_at', { ascending: true }),
        supabase
          .from('cleaner_job_reviews')
          .select('cleaner_id, rating')
          .eq('org_id', orgId),
      ])

      if (cleanersErr) throw cleanersErr
      if (jobsErr) throw jobsErr
      if (reviewErr) {
        // Keep dispatch usable even if review analytics fails.
        console.warn('Dispatch review stats load failed:', reviewErr)
      }

      const loadedCleaners = (cleanersData || []) as Cleaner[]
      const loadedJobs = ((jobsData || []) as any[])
        .map((row) => normalizeJobRow(row))
        .sort(sortByStartAscending)
      setCleaners(loadedCleaners)
      setJobs(loadedJobs)

      const quoteIds = Array.from(
        new Set(
          loadedJobs
            .map((j) => j.quote_id || j.series?.quote_id || null)
            .filter(Boolean)
        )
      ) as string[]

      const quoteById: Record<
        string,
        {
          address: string | null
          lat: number | null
          lng: number | null
          total_inc_gst: number | null
          service: string | null
        }
      > = {}

      if (quoteIds.length > 0) {
        const { data: quoteRows, error: quoteErr } = await supabase
          .from('quotes')
          .select('id, address, address_lat, address_lng, total_inc_gst, service')
          .eq('org_id', orgId)
          .in('id', quoteIds)

        if (!quoteErr && quoteRows) {
          for (const row of quoteRows as any[]) {
            quoteById[row.id] = {
              address: row.address ?? null,
              lat: typeof row.address_lat === 'number' ? row.address_lat : null,
              lng: typeof row.address_lng === 'number' ? row.address_lng : null,
              total_inc_gst:
                typeof row.total_inc_gst === 'number' ? row.total_inc_gst : null,
              service: typeof row.service === 'string' ? row.service : null,
            }
          }
        }
      }

      const nextPins: Record<string, QuotePin> = {}
      for (const job of loadedJobs) {
        const seriesId = job.series?.id
        if (!seriesId) continue
        const quoteId = job.quote_id || job.series?.quote_id || null
        const quote = quoteId ? quoteById[quoteId] : null
        const lat = quote?.lat ?? job.series?.service_lat ?? null
        const lng = quote?.lng ?? job.series?.service_lng ?? null
        nextPins[seriesId] = {
          address: quote?.address ?? job.series?.service_address ?? null,
          lat: typeof lat === 'number' ? lat : null,
          lng: typeof lng === 'number' ? lng : null,
          total_inc_gst:
            typeof quote?.total_inc_gst === 'number' ? quote.total_inc_gst : null,
          service: quote?.service ?? null,
        }
      }
      setQuotePins(nextPins)

      const aggregate: Record<string, { sum: number; rated: number; total: number }> = {}
      for (const row of (reviewRows || []) as any[]) {
        const cleanerId = row?.cleaner_id as string | undefined
        if (!cleanerId) continue
        const rating = typeof row?.rating === 'number' ? row.rating : Number.NaN
        if (!aggregate[cleanerId]) {
          aggregate[cleanerId] = { sum: 0, rated: 0, total: 0 }
        }
        aggregate[cleanerId].total += 1
        if (Number.isFinite(rating)) {
          aggregate[cleanerId].sum += rating
          aggregate[cleanerId].rated += 1
        }
      }

      const stats: Record<string, CleanerReviewStat> = {}
      for (const [cleanerId, value] of Object.entries(aggregate)) {
        stats[cleanerId] = {
          avg: value.rated > 0 ? value.sum / value.rated : null,
          count: value.total,
        }
      }
      setReviewStats(stats)

      const unassigned = loadedJobs.filter((j) => !j.cleaner_id)
      setSelectedJobId((prev) => {
        if (prev && loadedJobs.some((j) => j.id === prev)) return prev
        if (unassigned.length > 0) return unassigned[0].id
        return loadedJobs[0]?.id ?? null
      })
    } catch (err: any) {
      setError(err?.message || 'Failed to load dispatch board')
    } finally {
      setLoading(false)
    }
  }, [orgId, rangeStart, rangeEnd])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('date', selectedDate)
    params.set('view', viewMode)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    try {
      window.localStorage.setItem(STORAGE_DATE_KEY, selectedDate)
      window.localStorage.setItem(STORAGE_VIEW_KEY, viewMode)
    } catch {
      // Ignore storage failures.
    }
  }, [selectedDate, viewMode])

  const unassignedJobs = useMemo(
    () => jobs.filter((j) => !j.cleaner_id).sort(sortByStartAscending),
    [jobs]
  )
  const assignedJobs = useMemo(
    () => jobs.filter((j) => Boolean(j.cleaner_id)).sort(sortByStartAscending),
    [jobs]
  )
  const selectedJob = useMemo(
    () => (selectedJobId ? jobs.find((j) => j.id === selectedJobId) || null : null),
    [jobs, selectedJobId]
  )

  return {
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    jobs,
    cleaners,
    quotePins,
    reviewStats,
    unassignedJobs,
    assignedJobs,
    selectedJobId,
    setSelectedJobId,
    selectedJob,
    rangeStart,
    rangeEnd,
    loading,
    error,
    refresh,
  }
}

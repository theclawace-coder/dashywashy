export type DispatchViewMode = 'day' | 'week'

export type Cleaner = {
  id: string
  full_name: string
  phone: string | null
  base_location_text: string | null
  base_lat: number | null
  base_lng: number | null
  active: boolean | null
}

export type BookingOccurrence = {
  id: string
  series_id: string
  quote_id?: string | null
  start_at: string
  end_at: string
  status: string
  cleaner_id: string | null
  notes?: string | null
  series?: {
    id: string
    title: string
    lead_id: string
    quote_id?: string | null
    service_address: string | null
    service_lat: number | null
    service_lng: number | null
    notes?: string | null
    lead?: { id: string; name: string | null }
  }
}

export type QuotePin = {
  address: string | null
  lat: number | null
  lng: number | null
  total_inc_gst: number | null
  service: string | null
}

export type CleanerReviewStat = {
  avg: number | null
  count: number
}

export type CleanerRecommendation = {
  cleaner: Cleaner
  score: number
  distanceKm: number | null
  conflictCount: number
  workloadCount: number
  reviewAvg: number | null
  reviewCount: number
  status: 'available' | 'busy' | 'conflict'
  reasons: string[]
}

export function toYmd(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function startOfWeekMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return `$${Number(value).toFixed(2)}`
}


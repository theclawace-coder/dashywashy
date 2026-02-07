import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type SearchResult = {
  id: string
  label: string
  type: 'Lead' | 'Booking' | 'Cleaner'
  description?: string
  href: string
}

function ResultBadge({ type }: { type: SearchResult['type'] }) {
  const styles: Record<SearchResult['type'], string> = {
    Lead: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    Booking: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
    Cleaner: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${styles[type]}`}>{type}</span>
  )
}

export default function GlobalSearch() {
  const { currentOrg } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])
  const close = useCallback(() => setIsOpen(false), [])

  // Keyboard shortcut: Cmd/Ctrl + K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, close])

  // Allow other components (e.g., nav button) to open the search via a custom event.
  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    window.addEventListener('open-global-search', handleOpen)
    return () => window.removeEventListener('open-global-search', handleOpen)
  }, [])

  const trimmedQuery = useMemo(() => query.trim(), [query])

  const runSearch = useCallback(async () => {
    if (trimmedQuery.length < 2) {
      setResults([])
      setError(null)
      return
    }

    setIsSearching(true)
    setError(null)
    try {
      if (!currentOrg) {
        setResults([])
        return
      }

      const safe = trimmedQuery

      const [leadRes, bookingRes, cleanerRes] = await Promise.all([
        supabase
          .from('extracted_leads')
          .select('id, name, email, phone_number, status, created_at')
          .eq('org_id', currentOrg.id)
          .or(
            `name.ilike.%${safe}%,email.ilike.%${safe}%,phone_number.ilike.%${safe}%,region_notes.ilike.%${safe}%,status.ilike.%${safe}%`
          )
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('booking_occurrences')
          .select(
            `
            id,
            start_at,
            status,
            series:booking_series(
              title,
              lead:extracted_leads(name)
            )
          `
          )
          .eq('org_id', currentOrg.id)
          .or(
            `status.ilike.%${safe}%,series.title.ilike.%${safe}%,series.lead.name.ilike.%${safe}%`
          )
          .order('start_at', { ascending: false })
          .limit(8),
        supabase
          .from('cleaners')
          .select('id, full_name, phone, email, base_location_text, active')
          .eq('org_id', currentOrg.id)
          .or(
            `full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%,base_location_text.ilike.%${safe}%`
          )
          .order('full_name', { ascending: true })
          .limit(8),
      ])

      const aggregated: SearchResult[] = []

      if (leadRes.data) {
        aggregated.push(
          ...leadRes.data.map((lead) => ({
            id: lead.id,
            type: 'Lead' as const,
            label: lead.name || lead.email || lead.phone_number || 'Lead',
            description: [lead.status, lead.email || lead.phone_number]
              .filter(Boolean)
              .join(' • '),
            href: `/?lead=${lead.id}`,
          }))
        )
      }

      if (bookingRes.data) {
        const bookingData = bookingRes.data as any[]
        aggregated.push(
          ...bookingData.map((occ) => ({
            id: occ.id,
            type: 'Booking' as const,
            label: occ.series?.title || 'Booking',
            description: [
              occ.series?.lead?.name || 'Customer',
              occ.status ? occ.status.replace(/_/g, ' ') : null,
            ]
              .filter(Boolean)
              .join(' • '),
            href: `/calendar?occurrence=${occ.id}`,
          }))
        )
      }

      if (cleanerRes.data) {
        aggregated.push(
          ...cleanerRes.data.map((c) => ({
            id: c.id,
            type: 'Cleaner' as const,
            label: c.full_name || 'Cleaner',
            description: [c.base_location_text, c.phone || c.email]
              .filter(Boolean)
              .join(' • '),
            href: `/cleaners?cleaner=${c.id}`,
          }))
        )
      }

      setResults(aggregated)
    } catch (err: any) {
      console.error('Global search failed', err)
      setError(err?.message || 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [currentOrg, trimmedQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch()
    }, 200)
    return () => clearTimeout(timer)
  }, [runSearch])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setResults([])
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[12000] flex items-start justify-center p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl bg-[#0f121a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads, bookings, cleaners…"
              className="flex-1 bg-transparent text-white placeholder:text-[var(--color-text-muted)] focus:outline-none text-sm"
            />
            <div className="text-[11px] text-[var(--color-text-muted)] hidden sm:flex items-center gap-1">
              <kbd className="px-2 py-1 bg-white/10 rounded border border-white/10">Ctrl/Cmd</kbd>
              <span>+</span>
              <kbd className="px-2 py-1 bg-white/10 rounded border border-white/10">K</kbd>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="p-4 text-sm text-red-300 bg-red-500/10 border-b border-red-500/20">{error}</div>
          )}

          {!error && results.length === 0 && !isSearching && (
            <div className="p-6 text-center text-[var(--color-text-muted)] text-sm">Type at least 2 characters to search.</div>
          )}

          {isSearching && (
            <div className="p-4 flex items-center gap-2 text-[var(--color-text-muted)] text-sm">
              <svg className="w-4 h-4 animate-spin text-cyan-300" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching…
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <ul className="divide-y divide-white/5">
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    onClick={() => {
                      close()
                      window.location.href = result.href
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-start gap-3"
                  >
                    <ResultBadge type={result.type} />
                    <div className="flex-1">
                      <div className="text-white font-medium text-sm">{result.label}</div>
                      {result.description && (
                        <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 truncate">
                          {result.description}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}



import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import QuoteTool from './QuoteTool'
import { Button } from './ui'
import ManualWorkflowRunner from './automations/ManualWorkflowRunner'

type LeadRecord = {
  id: string
  name: string | null
  email: string | null
  phone_number: string | null
}

type Cleaner = {
  id: string
  full_name: string
  active: boolean | null
}

type JobDetail = {
  occurrence: {
    id: string
    start_at: string
    end_at: string
    status: string
    cleaner_id: string | null
  }
  series: {
    id: string
    title: string
    lead_id: string
    service_address: string | null
    service_lat: number | null
    service_lng: number | null
  }
  lead: LeadRecord | null
}

function formatRange(startAt: string, endAt: string) {
  const s = new Date(startAt)
  const e = new Date(endAt)
  return `${s.toLocaleDateString()} ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function CleanerSearchSelect({
  cleaners,
  value,
  onChange,
}: {
  cleaners: Cleaner[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = cleaners.filter((c) => c.active !== false)
    if (!needle) return base
    return base.filter((c) => c.full_name.toLowerCase().includes(needle))
  }, [cleaners, q])

  const selected = cleaners.find((c) => c.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10"
      >
        {selected ? selected.full_name : 'Unassigned'} <span className="text-white/40">▼</span>
      </button>

      {open && (
        <div className="absolute z-[10050] mt-2 w-full rounded-xl border border-white/10 bg-[#12141a] shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cleaner..."
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Unassigned
            </button>
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                {c.full_name}
              </button>
            ))}
            {list.length === 0 && <div className="px-3 py-3 text-sm text-white/60">No matches.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function JobModal() {
  const { currentOrg } = useAuth()
  const [open, setOpen] = useState(false)
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingAssign, setSavingAssign] = useState(false)
  const [showAutomationRunner, setShowAutomationRunner] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    setOccurrenceId(null)
    setJob(null)
    setError(null)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ occurrenceId?: string }>
      const id = ce?.detail?.occurrenceId
      if (!id) return
      setOccurrenceId(id)
      setOpen(true)
    }
    window.addEventListener('open-job-modal', handler as any)
    return () => window.removeEventListener('open-job-modal', handler as any)
  }, [])

  useEffect(() => {
    if (!open || !occurrenceId) return
    ;(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [{ data: cleanersData, error: cleanersErr }, { data: occ, error: occErr }] = await Promise.all([
          supabase.from('cleaners').select('id, full_name, active').order('full_name'),
          supabase
            .from('booking_occurrences')
            .select(
              `id, start_at, end_at, status, cleaner_id,
               series:booking_series(id, title, lead_id, quote_id, service_address, service_lat, service_lng, lead:extracted_leads(id, name, email, phone_number))`
            )
            .eq('id', occurrenceId)
            .single(),
        ])
        if (cleanersErr) throw cleanersErr
        if (occErr) throw occErr

        const lead = (occ as any)?.series?.lead as LeadRecord | null
        const series = (occ as any)?.series as any
        const quoteId = series?.quote_id as string | null

        setCleaners((cleanersData || []) as any)
        
        // Sync service address from the booking's linked quote
        let syncedAddress = series?.service_address ?? null
        let syncedLat = series?.service_lat ?? null
        let syncedLng = series?.service_lng ?? null

        if (series?.lead_id) {
          try {
            let quoteAddress: string | null = null
            let quoteLat: number | null = null
            let quoteLng: number | null = null

            if (quoteId) {
              const { data: quoteRow, error: quoteErr } = await supabase
                .from('quotes')
                .select('id, address, address_lat, address_lng')
                .eq('id', quoteId)
                .maybeSingle()

              if (!quoteErr && quoteRow) {
                quoteAddress = (quoteRow as any).address ?? null
                quoteLat = typeof (quoteRow as any).address_lat === 'number' ? (quoteRow as any).address_lat : null
                quoteLng = typeof (quoteRow as any).address_lng === 'number' ? (quoteRow as any).address_lng : null
              }
            } else {
              // Legacy fallback for bookings created before quote_id requirement
              console.warn('Booking series missing quote_id, falling back to latest quote')
              const { data: quotesData, error: quotesErr } = await supabase
                .from('quotes')
                .select('id, address, address_lat, address_lng')
                .eq('lead_id', series.lead_id)
                .order('created_at', { ascending: false })
                .limit(1)

              if (!quotesErr && quotesData && quotesData.length > 0) {
                const latestQuote = quotesData[0] as any
                quoteAddress = latestQuote.address ?? null
                quoteLat = typeof latestQuote.address_lat === 'number' ? latestQuote.address_lat : null
                quoteLng = typeof latestQuote.address_lng === 'number' ? latestQuote.address_lng : null
              }
            }

            const updatePayload: Record<string, any> = {}
            if (quoteId && series.quote_id !== quoteId) {
              updatePayload.quote_id = quoteId
            }
            if (quoteAddress && (!syncedAddress || syncedAddress !== quoteAddress)) {
              updatePayload.service_address = quoteAddress
            }
            if (
              typeof quoteLat === 'number' &&
              typeof quoteLng === 'number' &&
              (syncedLat !== quoteLat || syncedLng !== quoteLng)
            ) {
              updatePayload.service_lat = quoteLat
              updatePayload.service_lng = quoteLng
            }

            if (Object.keys(updatePayload).length) {
              const { error: updateErr } = await supabase.from('booking_series').update(updatePayload).eq('id', series.id)
              if (!updateErr) {
                syncedAddress = updatePayload.service_address ?? syncedAddress
                syncedLat = updatePayload.service_lat ?? syncedLat
                syncedLng = updatePayload.service_lng ?? syncedLng
              }
            }
          } catch (syncErr) {
            // Don't fail the whole load if sync fails, just log it
            console.warn('Failed to sync address from quote:', syncErr)
          }
        }

        setJob({
          occurrence: {
            id: (occ as any).id,
            start_at: (occ as any).start_at,
            end_at: (occ as any).end_at,
            status: (occ as any).status,
            cleaner_id: (occ as any).cleaner_id,
          },
          series: {
            id: series?.id,
            title: series?.title,
            lead_id: series?.lead_id,
            service_address: syncedAddress,
            service_lat: syncedLat,
            service_lng: syncedLng,
          },
          lead,
        })
      } catch (e: any) {
        setError(e?.message || 'Failed to load job')
        setJob(null)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [open, occurrenceId])

  const setCleaner = async (cleanerId: string) => {
    if (!job) return
    setSavingAssign(true)
    setError(null)
    try {
      const { error: err } = await supabase
        .from('booking_occurrences')
        .update({
          cleaner_id: cleanerId || null,
          assigned_at: cleanerId ? new Date().toISOString() : null,
        })
        .eq('id', job.occurrence.id)
      if (err) throw err
      setJob((prev) =>
        prev
          ? {
              ...prev,
              occurrence: { ...prev.occurrence, cleaner_id: cleanerId || null },
            }
          : prev
      )
      window.dispatchEvent(new CustomEvent('job-updated', { detail: { occurrenceId: job.occurrence.id } }))
    } catch (e: any) {
      setError(e?.message || 'Failed to assign cleaner')
    } finally {
      setSavingAssign(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10040] p-4" onClick={close}>
      <div
        className="bg-[var(--color-surface)] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <p className="text-xs uppercase text-[var(--color-text-muted)] tracking-wider">Job details</p>
            <h3 className="text-white font-semibold">
              {job?.lead?.name || 'Customer'} · {job?.series?.title || 'Job'}
            </h3>
            {job?.occurrence?.start_at && job?.occurrence?.end_at ? (
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {formatRange(job.occurrence.start_at, job.occurrence.end_at)} • {job.occurrence.status}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAutomationRunner(true)}>
              Run Automation
            </Button>
            <button
              onClick={close}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>
          )}

          {isLoading || !job ? (
            <div className="p-3 text-sm text-[var(--color-text-muted)]">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Service address</div>
                  <div className="text-white text-sm">{job.series.service_address || 'No address set yet (use QuoteTool address)'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Assigned cleaner</div>
                    {savingAssign ? <div className="text-xs text-[var(--color-text-muted)]">Saving…</div> : null}
                  </div>
                  <CleanerSearchSelect
                    cleaners={cleaners}
                    value={job.occurrence.cleaner_id || ''}
                    onChange={(id) => setCleaner(id)}
                  />
                </div>
              </div>

              <QuoteTool lead={job.lead} emailId={null} autoEditLatest />
            </>
          )}
        </div>
      </div>
      {job && currentOrg && (
        <ManualWorkflowRunner
          open={showAutomationRunner}
          onClose={() => setShowAutomationRunner(false)}
          orgId={currentOrg.id}
          entityType="booking"
          entityId={job.occurrence.id}
          entityLabel={job.series.title || job.lead?.name || 'Booking'}
        />
      )}
    </div>,
    document.body
  )
}










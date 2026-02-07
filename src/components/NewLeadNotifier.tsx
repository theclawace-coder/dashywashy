import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { playNewLeadSound } from '../lib/sounds'

type LeadSummary = {
  id: string
  name: string | null
  phone_number: string | null
  email: string | null
  created_at?: string | null
}

const FLASH_INTERVAL_MS = 900
export default function NewLeadNotifier() {
  const { currentOrg } = useAuth()
  const [queue, setQueue] = useState<LeadSummary[]>([])
  const [isVisible, setIsVisible] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const [isCalling, setIsCalling] = useState(false)
  const originalTitle = useRef<string>(document.title)
  const flashTimer = useRef<number | null>(null)

  const activeLead = queue[0] || null
  const hasPending = queue.length > 0

  // Subscribe to new extracted leads once globally
  useEffect(() => {
    if (!currentOrg) return
    const channel = supabase
      .channel('extracted_leads_global_notifier')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'extracted_leads', filter: 'org_id=eq.' + currentOrg.id }, (payload) => {
        const lead = payload.new as any
        if (!lead?.id) return
        const summary: LeadSummary = {
          id: lead.id,
          name: lead.name ?? 'New lead',
          phone_number: lead.phone_number ?? null,
          email: lead.email ?? null,
          created_at: lead.created_at ?? null,
        }
        setQueue((prev) => [...prev, summary])
        setIsVisible(true)
        playNewLeadSound()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Flash the browser tab title while there are pending leads
  useEffect(() => {
    if (hasPending) {
      if (flashTimer.current) return
      const baseTitle = originalTitle.current || document.title || 'Dashboard'
      let toggle = false
      flashTimer.current = window.setInterval(() => {
        document.title = toggle ? '🚨 NEW LEAD' : baseTitle
        toggle = !toggle
      }, FLASH_INTERVAL_MS)
      return
    }

    // Stop flashing when no pending
    if (flashTimer.current) {
      clearInterval(flashTimer.current)
      flashTimer.current = null
    }
    document.title = originalTitle.current
  }, [hasPending])

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (flashTimer.current) {
        clearInterval(flashTimer.current)
        flashTimer.current = null
      }
      document.title = originalTitle.current
    },
    []
  )

  const dismissCurrent = () =>
    setQueue((prev) => {
      const [, ...rest] = prev
      if (rest.length === 0) {
        setIsVisible(false)
      }
      return rest
    })

  const handleCall = async () => {
    if (!activeLead?.phone_number) {
      setCallError('No phone number available for this lead.')
      return
    }
    const phoneNumber = activeLead.phone_number
    setCallError(null)
    setIsCalling(true)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/call-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ phone_number: phoneNumber }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        const details = result?.error || 'Failed to initiate call'
        throw new Error(details)
      }

      // Record first contact if not set (store as ISO string)
      const nowIso = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('extracted_leads')
        .update({ first_contact: nowIso })
        .eq('id', activeLead.id)
        .is('first_contact', null)

      if (updateError) {
        console.error('Error recording first contact time (popup):', updateError)
        setCallError(updateError.message || 'Call placed, but failed to record first contact.')
      }
    } catch (err) {
      console.error('Error calling lead (popup):', err)
      setCallError(err instanceof Error ? err.message : 'Failed to initiate call')
    } finally {
      setIsCalling(false)
    }
  }

  if (!activeLead || !isVisible) return null

  return (
    <div className="fixed bottom-4 right-4 z-[2000] max-w-sm w-[90vw] sm:w-96">
      <div className="relative rounded-2xl bg-[var(--color-surface)] border border-emerald-400/40 shadow-2xl shadow-emerald-500/20 overflow-hidden">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10 pointer-events-none" />
        <div className="relative p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">New lead</p>
              <h3 className="text-lg font-semibold text-white leading-tight">
                {activeLead.name || 'New lead'}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] truncate">
                {activeLead.email || 'No email provided'}
              </p>
            </div>
            <button
              onClick={dismissCurrent}
              className="text-[var(--color-text-muted)] hover:text-white transition"
              aria-label="Dismiss new lead alert"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-white/80">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{queue.length} pending</span>
          </div>

          {callError && (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
              {callError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={dismissCurrent}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 text-white text-sm font-medium py-2 hover:bg-white/10 transition"
            >
              Mark as seen
            </button>
            <button
              onClick={handleCall}
              disabled={!activeLead.phone_number || isCalling}
              className={`flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeLead.phone_number
                  ? 'bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-60'
                  : 'bg-white/5 text-white/40 cursor-not-allowed'
              }`}
            >
              {isCalling ? 'Calling...' : '📞 Call'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


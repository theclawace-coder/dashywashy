import { useEffect, useState } from 'react'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Lead = {
  id: string
  name?: string | null
  email?: string | null
  phone_number?: string | null
  status?: string | null
}

type SMSJourney = {
  id: string
  lead_id: string
  status: string
  current_step: number
  next_send_at?: string | null
  started_at: string
  completed_at?: string | null
  cancelled_at?: string | null
  last_error?: string | null
}

type EmailJourney = {
  id: string
  lead_id: string
  status: string
  current_step: number
  next_send_at?: string | null
  started_at: string
  completed_at?: string | null
  cancelled_at?: string | null
  last_error?: string | null
}

type SMSLog = {
  step: number
  sent_at?: string | null
}

type EmailLog = {
  step: number
  sent_at?: string | null
}

type LeadWithJourneys = Lead & {
  sms_journey?: SMSJourney | null
  email_journey?: EmailJourney | null
  last_sms?: SMSLog | null
  last_email?: EmailLog | null
}

function getStatusLight(journey: SMSJourney | EmailJourney | null | undefined): 'green' | 'orange' | 'red' {
  if (!journey) return 'red'
  if (journey.status === 'completed' || journey.status === 'cancelled') return 'red'
  if (journey.status === 'paused') return 'red'
  if (journey.current_step >= 6) return 'orange'
  return 'green'
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return '—'
  }
}

export default function MarketingLoop() {
  const { currentOrg } = useAuth()
  const [leads, setLeads] = useState<LeadWithJourneys[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())

  const fetchLeads = async () => {
    try {
      setIsLoading(true)
      setError(null)

      if (!currentOrg) {
        setLeads([])
        setIsLoading(false)
        return
      }

      // Get all leads with Marketing Loop status
      const { data: leadsData, error: leadsError } = await supabase
        .from('extracted_leads')
        .select('id, name, email, phone_number, status')
        .eq('org_id', currentOrg.id)
        .eq('status', 'Marketing Loop')
        .order('created_at', { ascending: false })

      if (leadsError) throw leadsError

      if (!leadsData || leadsData.length === 0) {
        setLeads([])
        setIsLoading(false)
        return
      }

      const leadIds = leadsData.map((l) => l.id)

      // Get SMS journeys
      const { data: smsJourneys } = await supabase
        .from('marketing_sms_journeys')
        .select('*')
        .eq('org_id', currentOrg.id)
        .in('lead_id', leadIds)

      // Get Email journeys
      const { data: emailJourneys } = await supabase
        .from('marketing_email_journeys')
        .select('*')
        .eq('org_id', currentOrg.id)
        .in('lead_id', leadIds)

      // Get last SMS send per lead
      const { data: smsLogs } = await supabase
        .from('marketing_sms_logs')
        .select('lead_id, step, sent_at')
        .eq('org_id', currentOrg.id)
        .in('lead_id', leadIds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })

      // Get last email send per lead
      const { data: emailLogs } = await supabase
        .from('marketing_email_logs')
        .select('lead_id, step, sent_at')
        .eq('org_id', currentOrg.id)
        .in('lead_id', leadIds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })

      // Combine data
      const smsJourneysByLead = new Map((smsJourneys || []).map((j) => [j.lead_id, j]))
      const emailJourneysByLead = new Map((emailJourneys || []).map((j) => [j.lead_id, j]))

      const smsLogsByLead = new Map<string, SMSLog>()
      const emailLogsByLead = new Map<string, EmailLog>()

      smsLogs?.forEach((log) => {
        if (!smsLogsByLead.has(log.lead_id)) {
          smsLogsByLead.set(log.lead_id, { step: log.step, sent_at: log.sent_at })
        }
      })

      emailLogs?.forEach((log) => {
        if (!emailLogsByLead.has(log.lead_id)) {
          emailLogsByLead.set(log.lead_id, { step: log.step, sent_at: log.sent_at })
        }
      })

      const combined: LeadWithJourneys[] = leadsData.map((lead) => ({
        ...lead,
        sms_journey: smsJourneysByLead.get(lead.id) || null,
        email_journey: emailJourneysByLead.get(lead.id) || null,
        last_sms: smsLogsByLead.get(lead.id) || null,
        last_email: emailLogsByLead.get(lead.id) || null,
      }))

      setLeads(combined)
    } catch (err) {
      console.error('Error fetching marketing loop leads:', err)
      setError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!currentOrg) return

    fetchLeads()

    // Subscribe to changes
    const channel = supabase
      .channel('marketing_loop_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'extracted_leads', filter: 'org_id=eq.' + currentOrg.id },
        () => fetchLeads()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketing_sms_journeys', filter: 'org_id=eq.' + currentOrg.id },
        () => fetchLeads()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketing_email_journeys', filter: 'org_id=eq.' + currentOrg.id },
        () => fetchLeads()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentOrg])

  const handleAction = async (leadId: string, action: string, journeyType: 'sms' | 'email' | 'both' = 'both', step?: number) => {
    setActionLoading((prev) => new Set(prev).add(`${leadId}-${action}`))

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/marketing-loop-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          action,
          leadId,
          journeyType,
          step,
        }),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Action failed')
      }

      // Refresh data
      await fetchLeads()
    } catch (err) {
      console.error('Error performing action:', err)
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev)
        next.delete(`${leadId}-${action}`)
        return next
      })
    }
  }

  const handleSendNow = async (leadId: string, journeyType: 'sms' | 'email') => {
    await handleAction(leadId, 'send_now', journeyType)
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Marketing Loop</h1>
          <p className="text-sm text-white/60">Manage automated SMS and email journeys for leads in Marketing Loop</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-white/60 mb-1">Total Leads</div>
            <div className="text-2xl font-bold text-white">{leads.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-white/60 mb-1">Active Journeys</div>
            <div className="text-2xl font-bold text-white">
              {leads.filter((l) => l.sms_journey?.status === 'active' || l.email_journey?.status === 'active').length}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-white/60 mb-1">Completed</div>
            <div className="text-2xl font-bold text-white">
              {leads.filter((l) => l.sms_journey?.status === 'completed' && l.email_journey?.status === 'completed').length}
            </div>
          </div>
        </div>

        {/* Leads List */}
        {isLoading ? (
          <div className="text-center py-12 text-white/60">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-white/60">No leads in Marketing Loop</div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => {
              const smsLight = getStatusLight(lead.sms_journey)
              const emailLight = getStatusLight(lead.email_journey)
              const smsLoading = actionLoading.has(`${lead.id}-pause`) || actionLoading.has(`${lead.id}-resume`) || actionLoading.has(`${lead.id}-cancel`)
              const emailLoading = actionLoading.has(`${lead.id}-pause`) || actionLoading.has(`${lead.id}-resume`) || actionLoading.has(`${lead.id}-cancel`)

              return (
                <div key={lead.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* Lead Info */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">{lead.name || 'No name'}</h3>
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              smsLight === 'green'
                                ? 'bg-green-400'
                                : smsLight === 'orange'
                                ? 'bg-orange-400'
                                : 'bg-red-400'
                            }`}
                            title={`SMS: ${smsLight}`}
                          />
                          <span
                            className={`w-2 h-2 rounded-full ${
                              emailLight === 'green'
                                ? 'bg-green-400'
                                : emailLight === 'orange'
                                ? 'bg-orange-400'
                                : 'bg-red-400'
                            }`}
                            title={`Email: ${emailLight}`}
                          />
                        </div>
                      </div>
                      <div className="text-sm text-white/60 space-y-1">
                        {lead.phone_number && <div>📱 {lead.phone_number}</div>}
                        {lead.email && <div>✉️ {lead.email}</div>}
                      </div>
                    </div>

                    {/* SMS Journey Info */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs text-white/40 mb-1">SMS Journey</div>
                      {lead.sms_journey ? (
                        <div className="space-y-1 text-sm">
                          <div className="text-white">
                            Step {lead.sms_journey.current_step}/7 ·{' '}
                            <span className={lead.sms_journey.status === 'active' ? 'text-green-400' : 'text-white/60'}>
                              {lead.sms_journey.status}
                            </span>
                          </div>
                          <div className="text-white/60">
                            Next: {lead.sms_journey.next_send_at ? formatDate(lead.sms_journey.next_send_at) : '—'}
                          </div>
                          <div className="text-white/60">
                            Last: {lead.last_sms ? `Step ${lead.last_sms.step} at ${formatDate(lead.last_sms.sent_at)}` : 'Never'}
                          </div>
                          {lead.sms_journey.last_error && (
                            <div className="text-red-400 text-xs">Error: {lead.sms_journey.last_error}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-white/40 text-sm">No SMS journey</div>
                      )}
                    </div>

                    {/* Email Journey Info */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs text-white/40 mb-1">Email Journey</div>
                      {lead.email_journey ? (
                        <div className="space-y-1 text-sm">
                          <div className="text-white">
                            Step {lead.email_journey.current_step}/7 ·{' '}
                            <span className={lead.email_journey.status === 'active' ? 'text-green-400' : 'text-white/60'}>
                              {lead.email_journey.status}
                            </span>
                          </div>
                          <div className="text-white/60">
                            Next: {lead.email_journey.next_send_at ? formatDate(lead.email_journey.next_send_at) : '—'}
                          </div>
                          <div className="text-white/60">
                            Last: {lead.last_email ? `Step ${lead.last_email.step} at ${formatDate(lead.last_email.sent_at)}` : 'Never'}
                          </div>
                          {lead.email_journey.last_error && (
                            <div className="text-red-400 text-xs">Error: {lead.email_journey.last_error}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-white/40 text-sm">No email journey</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 min-w-[200px]">
                      <div className="text-xs text-white/40 mb-1">Actions</div>
                      <div className="flex flex-wrap gap-2">
                        {lead.sms_journey?.status === 'active' && (
                          <>
                            <button
                              onClick={() => handleAction(lead.id, 'pause', 'sms')}
                              disabled={smsLoading}
                              className="px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                            >
                              Pause SMS
                            </button>
                            <button
                              onClick={() => handleSendNow(lead.id, 'sms')}
                              disabled={smsLoading}
                              className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                            >
                              Send SMS Now
                            </button>
                          </>
                        )}
                        {lead.sms_journey?.status === 'paused' && (
                          <button
                            onClick={() => handleAction(lead.id, 'resume', 'sms')}
                            disabled={smsLoading}
                            className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                          >
                            Resume SMS
                          </button>
                        )}
                        {lead.email_journey?.status === 'active' && (
                          <>
                            <button
                              onClick={() => handleAction(lead.id, 'pause', 'email')}
                              disabled={emailLoading}
                              className="px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                            >
                              Pause Email
                            </button>
                            <button
                              onClick={() => handleSendNow(lead.id, 'email')}
                              disabled={emailLoading}
                              className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                            >
                              Send Email Now
                            </button>
                          </>
                        )}
                        {lead.email_journey?.status === 'paused' && (
                          <button
                            onClick={() => handleAction(lead.id, 'resume', 'email')}
                            disabled={emailLoading}
                            className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                          >
                            Resume Email
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(lead.id, 'cancel', 'both')}
                          disabled={smsLoading || emailLoading}
                          className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                        >
                          Stop All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

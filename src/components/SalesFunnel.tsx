/**
 * SalesFunnel - Apple VisionOS Kanban Pipeline
 * 
 * A beautiful drag-and-drop pipeline that feels effortless.
 * Glass columns, smooth animations, and clear visual hierarchy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Modal, useToast } from './ui'
import SmsLead from './SmsLead'
import QuoteTool from './QuoteTool'
import BookingModal from './BookingModal'

type ExtractedLead = {
  id: string
  email_id?: string
  name?: string | null
  phone_number?: string | null
  email?: string | null
  region_notes?: string | null
  extracted_at?: string | null
  created_at?: string | null
  status?: string | null
  first_contact?: string | null
  last_text_date?: string | null
  last_text_body?: string | null
}

type AutomationItem = {
  id: string
  label: string
  status: string
  type: 'workflow'
  href: string
  workflowId?: string
}

const STATUSES = ['Unanswered', 'Marketing Loop', 'Follow Up', 'Quote Sent', 'Job Won', 'Not interested', 'Jobs Completed']

// Status configuration with colors and icons
const STATUS_CONFIG: Record<string, { color: string; bgMuted: string; icon: string }> = {
  '': { color: '#64748b', bgMuted: 'rgba(100, 116, 139, 0.1)', icon: '📥' },
  'Unanswered': { color: '#fbbf24', bgMuted: 'rgba(251, 191, 36, 0.1)', icon: '📞' },
  'Marketing Loop': { color: '#d946ef', bgMuted: 'rgba(217, 70, 239, 0.1)', icon: '🔄' },
  'Follow Up': { color: '#a78bfa', bgMuted: 'rgba(167, 139, 250, 0.1)', icon: '📋' },
  'Quote Sent': { color: '#38bdf8', bgMuted: 'rgba(56, 189, 248, 0.1)', icon: '📧' },
  'Job Won': { color: '#34d399', bgMuted: 'rgba(52, 211, 153, 0.1)', icon: '🎉' },
  'Not interested': { color: '#6b7280', bgMuted: 'rgba(107, 114, 128, 0.1)', icon: '❌' },
  'Jobs Completed': { color: '#2dd4bf', bgMuted: 'rgba(45, 212, 191, 0.1)', icon: '✅' },
}

function normalizeTimestamp(val: string | number | null | undefined): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    const ms = val > 1e10 ? val : val * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function formatRelativeTime(val: string | number | null | undefined): string | null {
  if (!val) return null
  const d = typeof val === 'number' ? new Date(val) : new Date(val)
  if (Number.isNaN(d.getTime())) return null
  
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function getLeadDisplayName(lead: ExtractedLead) {
  const name = lead.name?.trim()
  if (name) return name
  const email = lead.email?.trim()
  if (email) return email
  const phone = lead.phone_number?.trim()
  if (phone) return phone
  return 'Unknown'
}

export default function SalesFunnel() {
  const { addToast } = useToast()
  const { currentOrg } = useAuth()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<ExtractedLead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState<string>('')
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [quoteLead, setQuoteLead] = useState<ExtractedLead | null>(null)
  const [bookingLead, setBookingLead] = useState<ExtractedLead | null>(null)
  const [pendingJobWonLead, setPendingJobWonLead] = useState<{ lead: ExtractedLead; fromStatus: string } | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [automationByLead, setAutomationByLead] = useState<Record<string, AutomationItem[]>>({})
  const [automationLeadId, setAutomationLeadId] = useState<string | null>(null)
  const [automationLoading, setAutomationLoading] = useState(false)
  const leadsRef = useRef<ExtractedLead[]>([])

  const fetchLeads = async () => {
    try {
      setIsLoading(true)
      if (!currentOrg) return
      const { data, error: leadsError } = await supabase
        .from('extracted_leads')
        .select('*')
        .eq('org_id', currentOrg.id)
        .or('status.is.null,status.neq.Archived')
        .order('created_at', { ascending: false })
        .limit(200)

      if (leadsError) throw leadsError
      const normalized = (data || []).map((lead: any) => ({
        ...lead,
        first_contact: normalizeTimestamp(lead.first_contact),
        last_text_date: normalizeTimestamp(lead.last_text_date),
      }))
      setLeads(normalized)
    } catch (err) {
      console.error('Error fetching leads for sales funnel:', err)
      addToast({ type: 'error', title: 'Failed to load leads', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAutomations = useCallback(async () => {
    if (!currentOrg) return
    const currentLeads = leadsRef.current
    if (currentLeads.length === 0) {
      setAutomationByLead({})
      setAutomationLoading(false)
      return
    }

    setAutomationLoading(true)

    try {
      const leadIds = currentLeads.map((lead) => lead.id)
      const chunkSize = 80
      const nextMap: Record<string, AutomationItem[]> = {}

      for (let i = 0; i < leadIds.length; i += chunkSize) {
        const chunk = leadIds.slice(i, i + chunkSize)
        const { data: runs, error: runsError } = await supabase
          .from('workflow_runs')
          .select('id, status, entity_id, workflow_id, workflow:workflows(id, name, system_key)')
          .eq('org_id', currentOrg.id)
          .eq('entity_type', 'lead')
          .in('entity_id', chunk)
          .in('status', ['active', 'paused'])

        if (runsError) throw runsError

        ;(runs || []).forEach((run: any) => {
          const systemKey = run.workflow?.system_key || ''
          const isMarketing = systemKey === 'marketing_sms' || systemKey === 'marketing_email'
          const workflowName = isMarketing
            ? systemKey === 'marketing_sms'
              ? 'Marketing Loop (SMS)'
              : 'Marketing Loop (Email)'
            : run.workflow?.name || 'Workflow'
          const entry: AutomationItem = {
            id: run.id,
            label: workflowName,
            status: run.status || 'active',
            type: 'workflow',
            href: isMarketing ? '/app/automations?view=runs&preset=marketing_loop' : `/app/settings/workflows/${run.workflow_id}`,
            workflowId: run.workflow_id,
          }
          if (!nextMap[run.entity_id]) nextMap[run.entity_id] = []
          nextMap[run.entity_id].push(entry)
        })
      }

      Object.values(nextMap).forEach((items) => {
        items.sort((a, b) => a.label.localeCompare(b.label))
      })

      setAutomationByLead(nextMap)
    } catch (err) {
      console.error('Error fetching automations:', err)
    } finally {
      setAutomationLoading(false)
    }
  }, [currentOrg])

  const updateStatus = async (leadId: string, status: string, skipBookingPrompt = false) => {
    const lead = leads.find((l) => l.id === leadId)
    const previousStatus = lead?.status || ''

    if (status === 'Job Won' && !skipBookingPrompt && lead) {
      setPendingJobWonLead({ lead, fromStatus: previousStatus })
      setDraggingId(null)
      setActiveColumn('')
      return
    }

    try {
      setSavingId(leadId)
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: status || null } : l)))

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')
      if (!currentOrg?.id) throw new Error('No organization selected')

      const response = await fetch(`${supabaseUrl}/functions/v1/update-lead-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg.id,
        },
        body: JSON.stringify({ leadId, status: status || null }),
      })

      let result: any = {}
      try {
        result = await response.json()
      } catch {
        const text = await response.text().catch(() => 'Unknown error')
        throw new Error(`Server error (${response.status}): ${text || 'Invalid response format'}`)
      }

      if (!response.ok || result?.error) {
        throw new Error(result?.error || result?.message || `HTTP ${response.status}`)
      }

      // Show success feedback
      const statusMessages: Record<string, string> = {
        'Job Won': '🎉 Lead marked as won!',
        'Quote Sent': '📧 Quote sent status updated',
        'Follow Up': '📋 Scheduled for follow-up',
        'Not interested': 'Lead archived',
        'Jobs Completed': '✅ Job completed!',
      }
      
      addToast({ type: 'success', title: statusMessages[status] || 'Status updated', duration: 2500 })
    } catch (err) {
      console.error('Error updating lead status:', err)
      addToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Unknown error' })
      fetchLeads()
    } finally {
      setSavingId(null)
      setDraggingId(null)
      setActiveColumn('')
    }
  }

  const handleBookingSuccess = () => {
    setPendingJobWonLead(null)
    setBookingLead(null)
    fetchLeads()
    addToast({ type: 'success', title: '📅 Booking created!', message: 'Job scheduled successfully' })
  }

  const handleBookingSkip = () => {
    if (pendingJobWonLead) {
      updateStatus(pendingJobWonLead.lead.id, 'Job Won', true)
    }
    setPendingJobWonLead(null)
    setBookingLead(null)
  }

  const handleBookingCancel = () => {
    setPendingJobWonLead(null)
    setBookingLead(null)
  }

  const handleCallLead = async (lead: ExtractedLead) => {
    if (!lead.phone_number) {
      addToast({ type: 'warning', title: 'No phone number', message: 'This lead has no phone number' })
      return
    }

    setCallingLeadId(lead.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')
      if (!currentOrg?.id) throw new Error('No organization selected')

      const response = await fetch(`${supabaseUrl}/functions/v1/call-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg.id,
        },
        body: JSON.stringify({ phone_number: lead.phone_number }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        throw new Error(result?.error || 'Failed to initiate call')
      }

      addToast({ type: 'success', title: '📞 Calling...', message: `Calling ${lead.name || lead.phone_number}` })

      if (!lead.first_contact) {
        const nowIso = new Date().toISOString()
        const { error: updateError } = await supabase
          .from('extracted_leads')
          .update({ first_contact: nowIso })
          .eq('id', lead.id)
          .eq('org_id', currentOrg!.id)
          .is('first_contact', null)

        if (!updateError) {
          setLeads((prev) =>
            prev.map((l) => (l.id === lead.id ? { ...l, first_contact: nowIso } : l))
          )
        }
      }
    } catch (err) {
      console.error('Error calling lead:', err)
      addToast({ type: 'error', title: 'Call failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setCallingLeadId(null)
    }
  }

  const handleDeleteLead = async (lead: ExtractedLead) => {
    if (!lead.id) return
    if (!window.confirm(lead.name ? `Remove ${lead.name}?` : 'Remove this lead?')) return

    setDeletingId(lead.id)
    setLeads((prev) => prev.filter((l) => l.id !== lead.id))
    
    try {
      const { error: deleteError } = await supabase
        .from('extracted_leads')
        .delete()
        .eq('id', lead.id)
        .eq('org_id', currentOrg!.id)
      if (deleteError) throw deleteError
      addToast({ type: 'success', title: 'Lead removed' })
      if (quoteLead?.id === lead.id) setQuoteLead(null)
      if (bookingLead?.id === lead.id) setBookingLead(null)
      if (pendingJobWonLead?.lead.id === lead.id) setPendingJobWonLead(null)
    } catch (err) {
      console.error('Error deleting lead:', err)
      addToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Unknown error' })
      fetchLeads()
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    fetchLeads()
    if (!currentOrg) return
    const channel = supabase
      .channel('extracted_leads_funnel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extracted_leads', filter: 'org_id=eq.' + currentOrg.id }, () => fetchLeads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs', filter: 'org_id=eq.' + currentOrg.id }, () => fetchAutomations())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentOrg, fetchAutomations])

  useEffect(() => {
    leadsRef.current = leads
    if (!currentOrg) return
    fetchAutomations()
  }, [currentOrg, fetchAutomations, leads])

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return leads
    return leads.filter((lead) => {
      const haystack = [lead.name, lead.email, lead.phone_number, lead.region_notes, lead.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [leads, search])

  const columns = [{ key: '', label: 'Inbox' }, ...STATUSES.map((s) => ({ key: s, label: s }))]

  const handleDrop = (columnKey: string) => {
    if (!draggingId) return
    const lead = leads.find((l) => l.id === draggingId)
    if (!lead || (lead.status || '') === columnKey) {
      setDraggingId(null)
      setActiveColumn('')
      return
    }
    updateStatus(draggingId, columnKey)
  }

  // Count totals
  const totalLeads = leads.length
  const wonCount = leads.filter(l => l.status === 'Job Won').length
  const inProgressCount = leads.filter(l => l.status && !['Job Won', 'Not interested', 'Jobs Completed'].includes(l.status)).length

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-heading text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              Sales Pipeline
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Drag leads between columns</p>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)]">
              <div className="text-center">
                <p className="text-lg font-bold text-white">{totalLeads}</p>
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">Total</p>
              </div>
              <div className="w-px h-6 bg-[var(--glass-border)]" />
              <div className="text-center">
                <p className="text-lg font-bold text-amber-400">{inProgressCount}</p>
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">Active</p>
              </div>
              <div className="w-px h-6 bg-[var(--glass-border)]" />
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{wonCount}</p>
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">Won</p>
              </div>
            </div>

            {/* Search & Refresh */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="input pl-8 w-36 py-1.5 text-sm"
                />
              </div>
              <Button onClick={fetchLeads} loading={isLoading} variant="secondary" size="sm">
                <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4">
        <div className="flex gap-3 h-full min-w-max">
          {columns.map((column) => {
            const items = filteredLeads.filter((lead) => (column.key ? lead.status === column.key : !lead.status))
            const config = STATUS_CONFIG[column.key] || STATUS_CONFIG['']
            const isActive = activeColumn === column.key && draggingId

            return (
              <div
                key={column.key || 'no-status'}
                onDragOver={(e) => {
                  e.preventDefault()
                  setActiveColumn(column.key)
                }}
                onDragLeave={() => setActiveColumn('')}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(column.key)
                }}
                className={`w-56 xl:w-64 2xl:w-72 flex-shrink-0 rounded-2xl flex flex-col h-full transition-all duration-300 ${
                  isActive 
                    ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-void)] scale-[1.02]' 
                    : ''
                }`}
                style={{ 
                  background: isActive ? config.bgMuted : 'var(--glass-bg)',
                  border: `1px solid ${isActive ? config.color : 'var(--glass-border)'}` 
                }}
              >
                {/* Column Header */}
                <div 
                  className="flex-shrink-0 px-4 py-3 border-b border-[var(--glass-border)]"
                  style={{ background: config.bgMuted }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <span className="text-sm font-semibold text-white">{column.label}</span>
                    </div>
                    <span 
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: config.bgMuted, color: config.color }}
                    >
                      {items.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 rounded-xl shimmer" />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                        style={{ background: config.bgMuted }}
                      >
                        <span className="text-2xl opacity-50">{config.icon}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {isActive ? 'Drop here' : 'No leads'}
                      </p>
                    </div>
                  ) : (
                    items.map((lead) => {
                      const isExpanded = expandedCard === lead.id
                      const lastCalled = formatRelativeTime(lead.first_contact)
                      const lastTexted = formatRelativeTime(lead.last_text_date)
                      const automationCount = (automationByLead[lead.id] || []).length

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => setDraggingId(lead.id)}
                          onDragEnd={() => {
                            setDraggingId(null)
                            setActiveColumn('')
                          }}
                          onClick={() => setExpandedCard(isExpanded ? null : lead.id)}
                          className={`relative rounded-xl border transition-all cursor-grab active:cursor-grabbing group ${
                            draggingId === lead.id 
                              ? 'opacity-50 scale-95 rotate-2' 
                              : 'hover:border-[var(--glass-border-hover)] hover:shadow-lg'
                          } ${savingId === lead.id ? 'animate-pulse' : ''}`}
                          data-testid="funnel-lead-card"
                          style={{
                            background: 'var(--color-surface)',
                            borderColor: 'var(--glass-border)'
                          }}
                        >
                          {/* Card Content */}
                          <div className="p-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{getLeadDisplayName(lead)}</p>
                                <p className="text-xs text-[var(--color-text-muted)] truncate">
                                  {lead.phone_number || lead.email || '—'}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteLead(lead)
                                }}
                                disabled={deletingId === lead.id}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition-all"
                                data-testid="funnel-lead-delete"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {automationCount > 0 && (
                              <div className="mb-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAutomationLeadId(lead.id)
                                  }}
                                  className="flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 hover:border-emerald-400/50 transition-colors"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>
                                    {automationCount} automation{automationCount === 1 ? '' : 's'} running
                                  </span>
                                </button>
                              </div>
                            )}

                            {/* Activity indicators */}
                            <div className="flex items-center gap-3 text-[10px] mb-2">
                              <span className={`flex items-center gap-1 ${lastCalled ? 'text-emerald-400' : 'text-[var(--color-text-muted)]'}`}>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {lastCalled || 'Not called'}
                              </span>
                              <span className={`flex items-center gap-1 ${lastTexted ? 'text-violet-400' : 'text-[var(--color-text-muted)]'}`}>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                {lastTexted || 'No SMS'}
                              </span>
                            </div>

                            {/* Expanded content */}
                            {isExpanded && (
                              <div className="space-y-2 pt-2 border-t border-[var(--glass-border)] animate-in fade-in slide-in-from-top-2 duration-200">
                                {lead.region_notes && (
                                  <p className="text-xs text-[var(--color-text-secondary)]">{lead.region_notes}</p>
                                )}
                                {lead.last_text_body && (
                                  <p className="text-xs text-[var(--color-text-muted)] italic truncate">"{lead.last_text_body}"</p>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--glass-border)]">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCallLead(lead)
                                }}
                                loading={callingLeadId === lead.id}
                                disabled={!lead.phone_number}
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                data-testid="funnel-lead-call"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                              </Button>

                              <div onClick={(e) => e.stopPropagation()}>
                                <SmsLead
                                  leadId={lead.id}
                                  leadName={lead.name}
                                  phoneNumber={lead.phone_number}
                                  onSent={({ sentAt, message }) => {
                                    setLeads((prev) =>
                                      prev.map((l) =>
                                        l.id === lead.id ? { ...l, last_text_date: sentAt, last_text_body: message } : l
                                      )
                                    )
                                    addToast({ type: 'success', title: '💬 SMS sent!' })
                                  }}
                                />
                              </div>

                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setQuoteLead(lead)
                                }}
                                variant="secondary"
                                size="sm"
                                data-testid="funnel-lead-quote"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </Button>

                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/app/leads/${lead.id}`)
                                }}
                                variant="ghost"
                                size="sm"
                                data-testid="funnel-lead-profile"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </Button>

                              {lead.status === 'Job Won' && (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setBookingLead(lead)
                                  }}
                                  variant="secondary"
                                  size="sm"
                                  className="text-cyan-400"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quote Modal */}
      {quoteLead && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[500] p-4"
          onClick={() => setQuoteLead(null)}
        >
          <div
            className="glass-elevated w-full max-w-5xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
              <div>
                <p className="text-micro">Create Quote</p>
                <h3 className="text-heading text-white">
                  {quoteLead.name || 'Lead'} · {quoteLead.email || quoteLead.phone_number || ''}
                </h3>
              </div>
              <button
                onClick={() => setQuoteLead(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <QuoteTool lead={quoteLead} emailId={quoteLead.email_id ?? null} autoEditLatest />
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!automationLeadId}
        onClose={() => setAutomationLeadId(null)}
        title="Active Automations"
        description={
          automationLeadId
            ? `Currently running automations for ${getLeadDisplayName(leads.find((lead) => lead.id === automationLeadId) || { id: automationLeadId })}.`
            : undefined
        }
        size="lg"
      >
        {automationLeadId && (
          <div className="space-y-3">
            {automationLoading && (
              <p className="text-sm text-[var(--color-text-muted)]">Loading automation runs...</p>
            )}
            {!automationLoading && (automationByLead[automationLeadId] || []).length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No active automations found.</p>
            ) : (
              (automationByLead[automationLeadId] || []).map((automation) => (
                <div
                  key={automation.id}
                  className="flex items-center justify-between gap-4 rounded-lg bg-white/5 border border-white/10 p-3"
                >
                  <div>
                    <p className="text-sm text-white">{automation.label}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Status: {automation.status}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAutomationLeadId(null)
                      navigate(automation.href)
                    }}
                  >
                    View flow
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* Booking Modals */}
      {pendingJobWonLead && (
        <BookingModal
          lead={pendingJobWonLead.lead}
          onClose={handleBookingCancel}
          onSuccess={handleBookingSuccess}
          onSkip={handleBookingSkip}
        />
      )}

      {bookingLead && (
        <BookingModal
          lead={bookingLead}
          onClose={() => setBookingLead(null)}
          onSuccess={() => {
            setBookingLead(null)
            fetchLeads()
          }}
          onSkip={() => setBookingLead(null)}
        />
      )}
    </div>
  )
}

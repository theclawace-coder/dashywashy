/**
 * TodoPage - Apple VisionOS Daily Checklist
 * 
 * A beautiful, motivating checklist with Duolingo-style micro-feedback.
 * Progress rings, streaks, and satisfying completion animations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfDay, addDays, isFriday, startOfWeek, endOfWeek, subDays, isAfter, isBefore } from 'date-fns'
import { useAuth } from '../lib/auth'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { playSaveSound } from '../lib/sounds'
import { GlassCard, Button, Badge, useToast, ProgressRing, StreakBadge, Encouragement } from './ui'
import SmsLead from './SmsLead'

type TodoType = 'lead_status' | 'unassigned_job' | 'mark_jobs_complete' | 'past_due_unpaid' | 'cleaner_payout' | 'manual'

interface Todo {
  id: string
  type: TodoType
  reference_id: string | null
  reference_type: string | null
  title: string
  description: string | null
  is_completed: boolean
  due_date: string | null
  auto_generated: boolean
  roll_over: boolean
  created_at: string
  completed_at: string | null
  dismissed_at: string | null
}

interface Lead { id: string; name: string | null; phone_number: string | null; status: string | null; last_text_date?: string | number | null; last_text_body?: string | null; created_at: string }
interface JobOccurrence { id: string; series_id: string; start_at: string; end_at: string; status: string; cleaner_id: string | null; series?: { title: string; lead_id?: string | null; lead?: { id: string; name: string | null }; quote_id?: string } }
interface CleanerPayout { id: string; occurrence_id: string; cleaner_id: string; paid_at: string | null; payout_amount: number; cleaner?: { full_name: string }; occurrence?: { start_at: string; series?: { title: string } } }

const TODO_CONFIG: Record<TodoType, { color: string; bgMuted: string; icon: string; label: string }> = {
  lead_status: { color: '#fbbf24', bgMuted: 'rgba(251, 191, 36, 0.1)', icon: '👤', label: 'Lead Status' },
  unassigned_job: { color: '#f97316', bgMuted: 'rgba(249, 115, 22, 0.1)', icon: '📋', label: 'Unassigned Jobs' },
  mark_jobs_complete: { color: '#a78bfa', bgMuted: 'rgba(167, 139, 250, 0.1)', icon: '✅', label: 'Mark Complete' },
  past_due_unpaid: { color: '#f43f5e', bgMuted: 'rgba(244, 63, 94, 0.1)', icon: '💰', label: 'Past Due' },
  cleaner_payout: { color: '#d946ef', bgMuted: 'rgba(217, 70, 239, 0.1)', icon: '💸', label: 'Payouts' },
  manual: { color: '#22d3ee', bgMuted: 'rgba(34, 211, 238, 0.1)', icon: '✏️', label: 'Manual' },
}

const ENCOURAGEMENTS = [
  "You cleared today's schedule — nice.",
  "Great work! You're on a roll.",
  "All done! Time for a well-deserved break.",
  "Nice job staying on top of things!",
  "You crushed it today!",
]

export default function TodoPage() {
  const { currentOrg } = useAuth()
  const { addToast } = useToast()
  const [manualTodos, setManualTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [todosTableUnavailable, setTodosTableUnavailable] = useState(false)
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null)
  const [leadsWithoutStatus, setLeadsWithoutStatus] = useState<Lead[]>([])
  const [unassignedJobs, setUnassignedJobs] = useState<JobOccurrence[]>([])
  const [overdueUnmarkedJobs, setOverdueUnmarkedJobs] = useState<JobOccurrence[]>([])
  const [pastDueUnpaidJobs, setPastDueUnpaidJobs] = useState<JobOccurrence[]>([])
  const [unpaidCleanerPayouts, setUnpaidCleanerPayouts] = useState<CleanerPayout[]>([])
  const [, setLastCallsByLead] = useState<Record<string, string>>({})
  const [dismissedItems, setDismissedItems] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('todo-dismissed') || '{}') } catch { return {} }
  })
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoDescription, setNewTodoDescription] = useState('')
  const [isAddingTodo, setIsAddingTodo] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  const [showEncouragement, setShowEncouragement] = useState(false)
  const [encouragementMessage, setEncouragementMessage] = useState('')

  const today = useMemo(() => startOfDay(new Date()), [])
  const isTodayFriday = isFriday(today)
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today])

  const saveDismissed = useCallback((dismissed: Record<string, boolean>) => {
    setDismissedItems(dismissed)
    try { localStorage.setItem('todo-dismissed', JSON.stringify(dismissed)) } catch {}
  }, [])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const fiveDaysFromNow = addDays(today, 5)
      const twoDaysAgo = subDays(today, 2)
      const now = new Date()

      // Leads without status
      const { data: leads } = await supabase.from('extracted_leads').select('id, name, phone_number, status, created_at, last_text_date, last_text_body').eq('org_id', currentOrg!.id).order('created_at', { ascending: false }).limit(1000)
      const leadsNoStatus = (leads || []).filter((l: any) => !l.status || l.status === '')
      setLeadsWithoutStatus(leadsNoStatus)
      // Unassigned jobs
      const { data: unassignedData } = await supabase.from('booking_occurrences').select(`id, series_id, quote_id, start_at, end_at, status, cleaner_id, series:booking_series(title, lead_id, lead:extracted_leads(id, name), quote_id)`).eq('org_id', currentOrg!.id).gte('start_at', today.toISOString()).lt('start_at', fiveDaysFromNow.toISOString()).is('cleaner_id', null).neq('status', 'cancelled').order('start_at', { ascending: true })
      setUnassignedJobs((unassignedData || []) as any)

      // Overdue unmarked
      const { data: overdueData } = await supabase.from('booking_occurrences').select(`id, series_id, quote_id, start_at, end_at, status, cleaner_id, series:booking_series(title, lead_id, lead:extracted_leads(id, name), quote_id)`).eq('org_id', currentOrg!.id).lt('start_at', now.toISOString()).neq('status', 'completed').neq('status', 'cancelled').order('start_at', { ascending: false }).limit(1000)
      setOverdueUnmarkedJobs((overdueData || []) as any)

      // Past due unpaid
      const { data: pastDueData } = await supabase.from('booking_occurrences').select(`id, series_id, quote_id, start_at, end_at, status, cleaner_id, payment_status, payment_paid_at, series:booking_series(title, lead_id, lead:extracted_leads(id, name), quote_id)`).eq('org_id', currentOrg!.id).lt('start_at', twoDaysAgo.toISOString()).in('status', ['completed', 'scheduled']).order('start_at', { ascending: false }).limit(100)
      const occurrenceIds = (pastDueData || []).map((o: any) => o.id)
      if (occurrenceIds.length > 0) {
        const quoteIds = (pastDueData || []).map((o: any) => o.quote_id || o.series?.quote_id).filter(Boolean)
        let paidQuoteIds = new Set<string>()
        if (quoteIds.length > 0) {
          const { data: paidQuotes } = await supabase.from('quotes').select('id, accepted_payment_method').eq('org_id', currentOrg!.id).in('id', quoteIds)
          paidQuoteIds = new Set((paidQuotes || []).filter((q: any) => q.accepted_payment_method === 'card_paid' || q.accepted_payment_method === 'direct_transfer').map((q: any) => q.id))
        }
        const unpaidPastDue = (pastDueData || []).filter((o: any) => {
          const isPaidOnOccurrence = o.payment_status === 'paid' || o.payment_paid_at !== null
          const quoteId = o.quote_id || o.series?.quote_id
          return !isPaidOnOccurrence && !paidQuoteIds.has(quoteId)
        })
        setPastDueUnpaidJobs(unpaidPastDue as any)
      } else { setPastDueUnpaidJobs([]) }

      // Cleaner payouts
      const { data: payoutsData } = await supabase.from('cleaner_payouts').select(`id, occurrence_id, cleaner_id, paid_at, payout_amount, cleaner:cleaners(full_name), occurrence:booking_occurrences(start_at, series:booking_series(title))`).eq('org_id', currentOrg!.id).is('paid_at', null).order('created_at', { ascending: false }).limit(200)
      const weekPayouts = (payoutsData || []).filter((p: any) => {
        const jobDate = p.occurrence?.start_at ? new Date(p.occurrence.start_at) : null
        if (!jobDate) return false
        return isAfter(jobDate, weekStart) && isBefore(jobDate, addDays(weekEnd, 1))
      })
      setUnpaidCleanerPayouts(weekPayouts as any)

      // Manual todos
      const { data: todosData, error: todosErr } = await supabase.from('todos').select('*').eq('org_id', currentOrg!.id).eq('type', 'manual').order('created_at', { ascending: false })
      if (todosErr?.code === 'PGRST205') { setTodosTableUnavailable(true); setManualTodos([]) } 
      else { setTodosTableUnavailable(false); setManualTodos((todosData || []) as Todo[]) }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load', message: err?.message })
    } finally { setIsLoading(false) }
  }, [today, weekStart, weekEnd, addToast])

  useEffect(() => { fetchData() }, [fetchData])

  // Broadcast todo count
  useEffect(() => {
    const count = getTotalPendingCount()
    window.dispatchEvent(new CustomEvent('todo-count-update', { detail: { count } }))
  })

  const handleAddManualTodo = async () => {
    if (!newTodoTitle.trim()) { addToast({ type: 'warning', title: 'Enter a title' }); return }
    setIsAddingTodo(true)
    try {
      const { data, error: insertErr } = await supabase.from('todos').insert({ org_id: currentOrg!.id, type: 'manual', title: newTodoTitle.trim(), description: newTodoDescription.trim() || null, is_completed: false, auto_generated: false, roll_over: true, due_date: format(today, 'yyyy-MM-dd') }).select().single()
      if (insertErr?.code === 'PGRST205') { addToast({ type: 'warning', title: 'Syncing...', message: 'Manual todos are temporarily unavailable' }); return }
      if (insertErr) throw insertErr
      setManualTodos(prev => [data as Todo, ...prev])
      setNewTodoTitle(''); setNewTodoDescription('')
      addToast({ type: 'success', title: '✅ Todo added!' })
      playSaveSound()
    } catch (err: any) { addToast({ type: 'error', title: 'Failed to add', message: err?.message }) }
    finally { setIsAddingTodo(false) }
  }

  const handleToggleManualTodo = async (todo: Todo) => {
    try {
      const newCompleted = !todo.is_completed
      await supabase.from('todos').update({ is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }).eq('id', todo.id).eq('org_id', currentOrg!.id)
      setManualTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null } : t))
      playSaveSound()
      if (newCompleted && getTotalPendingCount() <= 1) {
        setEncouragementMessage(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)])
        setShowEncouragement(true)
      }
    } catch (err: any) { addToast({ type: 'error', title: 'Failed to update', message: err?.message }) }
  }

  const handleDeleteManualTodo = async (todoId: string) => {
    if (!confirm('Delete this todo?')) return
    try {
      await supabase.from('todos').delete().eq('id', todoId).eq('org_id', currentOrg!.id)
      setManualTodos(prev => prev.filter(t => t.id !== todoId))
      playSaveSound()
    } catch (err: any) { addToast({ type: 'error', title: 'Failed to delete', message: err?.message }) }
  }

  const handleDismissItem = (key: string) => { saveDismissed({ ...dismissedItems, [key]: true }); playSaveSound() }

  const handleMarkLeadStatus = async (leadId: string, status: string) => {
    try {
      await supabase.from('extracted_leads').update({ status }).eq('id', leadId).eq('org_id', currentOrg!.id)
      setLeadsWithoutStatus(prev => prev.filter(l => l.id !== leadId))
      addToast({ type: 'success', title: '✅ Status updated!' })
      playSaveSound()
      if (getTotalPendingCount() <= 1) { setEncouragementMessage(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]); setShowEncouragement(true) }
    } catch (err: any) { addToast({ type: 'error', title: 'Failed to update', message: err?.message }) }
  }

  const handleCallLead = async (leadId: string, phoneNumber?: string | null) => {
    if (!phoneNumber) { addToast({ type: 'warning', title: 'No phone number' }); return }
    setCallingLeadId(leadId)
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
      if (!response.ok || result?.error) throw new Error(result?.error || 'Failed')
      setLastCallsByLead((prev) => ({ ...prev, [leadId]: new Date().toISOString() }))
      addToast({ type: 'success', title: '📞 Calling...' })
    } catch (err: any) { addToast({ type: 'error', title: 'Call failed', message: err?.message }) }
    finally { setCallingLeadId(null) }
  }

  const handleMarkPayoutPaid = async (payoutId: string) => {
    try {
      await supabase.from('cleaner_payouts').update({ paid_at: new Date().toISOString(), paid_by: 'admin' }).eq('id', payoutId).eq('org_id', currentOrg!.id)
      setUnpaidCleanerPayouts(prev => prev.filter(p => p.id !== payoutId))
      addToast({ type: 'success', title: '💸 Payout marked!' })
      playSaveSound()
    } catch (err: any) { addToast({ type: 'error', title: 'Failed', message: err?.message }) }
  }

  const handleMarkJobComplete = async (occurrenceId: string) => {
    try {
      await supabase.from('booking_occurrences').update({ status: 'completed' }).eq('id', occurrenceId).eq('org_id', currentOrg!.id)
      const { data: occ } = await supabase.from('booking_occurrences').select('series:booking_series(lead_id)').eq('id', occurrenceId).eq('org_id', currentOrg!.id).single()
      if ((occ as any)?.series?.lead_id) await supabase.from('extracted_leads').update({ status: 'Jobs Completed' }).eq('id', (occ as any).series.lead_id).eq('org_id', currentOrg!.id)
      setOverdueUnmarkedJobs(prev => prev.filter(j => j.id !== occurrenceId))
      addToast({ type: 'success', title: '✅ Job completed!' })
      playSaveSound()
    } catch (err: any) { addToast({ type: 'error', title: 'Failed', message: err?.message }) }
  }

  const getTotalPendingCount = () => {
    let count = 0
    count += leadsWithoutStatus.filter(l => !dismissedItems[`lead-${l.id}`]).length
    count += unassignedJobs.filter(j => !dismissedItems[`unassigned-${j.id}`]).length
    count += overdueUnmarkedJobs.filter(j => !dismissedItems[`overdue-${j.id}`]).length
    count += pastDueUnpaidJobs.filter(j => !dismissedItems[`pastdue-${j.id}`]).length
    if (isTodayFriday || unpaidCleanerPayouts.length > 0) count += unpaidCleanerPayouts.filter(p => !dismissedItems[`payout-${p.id}`]).length
    count += manualTodos.filter(t => !t.is_completed).length
    return count
  }

  const totalTasks = leadsWithoutStatus.length + unassignedJobs.length + overdueUnmarkedJobs.length + pastDueUnpaidJobs.length + unpaidCleanerPayouts.length + manualTodos.length
  const completedTasks = totalTasks - getTotalPendingCount()
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const allComplete = getTotalPendingCount() === 0
  const filteredManualTodos = useMemo(() => {
    if (filter === 'all') return manualTodos
    if (filter === 'completed') return manualTodos.filter(t => t.is_completed)
    return manualTodos.filter(t => !t.is_completed)
  }, [manualTodos, filter])

  const sections = [
    { type: 'lead_status' as TodoType, items: leadsWithoutStatus.filter(l => !dismissedItems[`lead-${l.id}`]), complete: leadsWithoutStatus.filter(l => !dismissedItems[`lead-${l.id}`]).length === 0 },
    { type: 'unassigned_job' as TodoType, items: unassignedJobs.filter(j => !dismissedItems[`unassigned-${j.id}`]), complete: unassignedJobs.filter(j => !dismissedItems[`unassigned-${j.id}`]).length === 0 },
    { type: 'mark_jobs_complete' as TodoType, items: overdueUnmarkedJobs.filter(j => !dismissedItems[`overdue-${j.id}`]), complete: overdueUnmarkedJobs.filter(j => !dismissedItems[`overdue-${j.id}`]).length === 0 },
    { type: 'past_due_unpaid' as TodoType, items: pastDueUnpaidJobs.filter(j => !dismissedItems[`pastdue-${j.id}`]), complete: pastDueUnpaidJobs.filter(j => !dismissedItems[`pastdue-${j.id}`]).length === 0 },
    { type: 'cleaner_payout' as TodoType, items: unpaidCleanerPayouts.filter(p => !dismissedItems[`payout-${p.id}`]), complete: unpaidCleanerPayouts.filter(p => !dismissedItems[`payout-${p.id}`]).length === 0, showOnFriday: true },
  ]

  if (!currentOrg) return null

  return (
    <div className="min-h-screen p-6">
      <Encouragement message={encouragementMessage} show={showEncouragement} onHide={() => setShowEncouragement(false)} />
      
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Progress */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <ProgressRing progress={progressPercent} size={80} strokeWidth={6}>
              <span className="text-xl font-bold text-white">{progressPercent}%</span>
            </ProgressRing>
            <div>
              <h1 className="text-title text-white flex items-center gap-3">
                📋 Daily Checklist
                {allComplete && <Badge variant="success">All Done!</Badge>}
              </h1>
              <p className="text-caption">{format(today, 'EEEE, MMMM d, yyyy')} • {getTotalPendingCount()} items pending</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StreakBadge count={3} label="day streak" />
            <Button onClick={fetchData} loading={isLoading} variant="primary" size="sm">
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </Button>
          </div>
        </header>

        {/* Category Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {sections.map((section) => {
            const config = TODO_CONFIG[section.type]
            return (
              <GlassCard 
                key={section.type} 
                className={`p-4 border ${section.complete ? 'border-emerald-500/30' : ''}`}
                style={{ borderColor: section.complete ? undefined : `${config.color}30` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{config.icon}</span>
                  <p className="text-xs text-[var(--color-text-muted)]">{config.label}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className={`text-2xl font-bold`} style={{ color: section.complete ? '#34d399' : config.color }}>
                    {section.items.length}
                  </p>
                  {section.complete && <span className="text-emerald-400 text-lg">✓</span>}
                  {section.showOnFriday && isTodayFriday && !section.complete && (
                    <span className="text-xs text-purple-300 animate-pulse">Friday!</span>
                  )}
                </div>
              </GlassCard>
            )
          })}
          <GlassCard className="p-4 border border-cyan-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✏️</span>
              <p className="text-xs text-[var(--color-text-muted)]">Manual</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-cyan-400">{manualTodos.filter(t => !t.is_completed).length}</p>
              {manualTodos.filter(t => !t.is_completed).length === 0 && <span className="text-emerald-400 text-lg">✓</span>}
            </div>
          </GlassCard>
        </div>

        {/* All Complete Celebration */}
        {allComplete && !isLoading && (
          <GlassCard className="p-8 text-center bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border-emerald-500/30">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-2xl font-bold text-white mb-2">All Done!</h3>
            <p className="text-emerald-200">Great work! You've completed all your end-of-day tasks.</p>
          </GlassCard>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Auto-generated Sections */}
          <div className="space-y-4">
            {sections.map((section) => {
              const config = TODO_CONFIG[section.type]
              if (section.showOnFriday && !isTodayFriday && section.items.length === 0) return null
              
              return (
                <GlassCard key={section.type} className="overflow-hidden">
                  <div className="p-4 border-b border-[var(--glass-border)]" style={{ background: config.bgMuted }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{config.icon}</span>
                        <h2 className="font-semibold" style={{ color: config.color }}>{config.label}</h2>
                      </div>
                      {section.complete && <Badge variant="success">✓ Complete</Badge>}
                    </div>
                  </div>
                  <div className="p-3 max-h-64 overflow-y-auto space-y-2">
                    {isLoading ? (
                      <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
                    ) : section.items.length === 0 ? (
                      <div className="py-6 text-center text-emerald-300 text-sm">✓ All done!</div>
                    ) : (
                      section.items.map((item: any) => {
                        const key = `${section.type === 'lead_status' ? 'lead' : section.type === 'unassigned_job' ? 'unassigned' : section.type === 'mark_jobs_complete' ? 'overdue' : section.type === 'past_due_unpaid' ? 'pastdue' : 'payout'}-${item.id}`
                        
                        if (section.type === 'lead_status') {
                          const lead = item as Lead
                          return (
                            <div key={lead.id} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-medium truncate">{lead.name || 'No name'}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">{lead.phone_number || 'No phone'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <a href={`/app/leads/${lead.id}?return=/app/todo`}>
                                  <Button size="sm" variant="ghost">Profile</Button>
                                </a>
                                <SmsLead leadId={lead.id} leadName={lead.name} phoneNumber={lead.phone_number} onSent={({ sentAt, message }) => setLeadsWithoutStatus((prev) => prev.map((l) => l.id === lead.id ? { ...l, last_text_date: sentAt, last_text_body: message } : l))} />
                                <Button size="sm" variant="primary" onClick={() => handleCallLead(lead.id, lead.phone_number)} loading={callingLeadId === lead.id}>Call</Button>
                                <select onChange={(e) => handleMarkLeadStatus(lead.id, e.target.value)} className="input px-2 py-1 text-xs" defaultValue="">
                                  <option value="" disabled>Status</option>
                                  <option value="Marketing Loop">Marketing Loop</option>
                                  <option value="Follow Up">Follow Up</option>
                                  <option value="Quote Sent">Quote Sent</option>
                                  <option value="Job Won">Job Won</option>
                                  <option value="Not interested">Not interested</option>
                                </select>
                                <Button size="sm" variant="ghost" onClick={() => handleDismissItem(key)}>✕</Button>
                              </div>
                            </div>
                          )
                        }
                        
                        if (section.type === 'unassigned_job') {
                          const job = item as JobOccurrence
                          const leadProfileHref = job.series?.lead_id ? `/app/leads/${job.series.lead_id}?return=/app/todo` : null
                          return (
                            <div key={job.id} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-medium truncate">{job.series?.lead?.name || 'Customer'} • {job.series?.title || 'Job'}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">{format(new Date(job.start_at), 'EEE, MMM d • h:mm a')}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {leadProfileHref && (
                                  <a href={leadProfileHref}><Button size="sm" variant="ghost">Profile</Button></a>
                                )}
                                <a href="/app/dispatch"><Button size="sm" variant="primary">Assign →</Button></a>
                                <Button size="sm" variant="ghost" onClick={() => handleDismissItem(key)}>✕</Button>
                              </div>
                            </div>
                          )
                        }
                        
                        if (section.type === 'mark_jobs_complete') {
                          const job = item as JobOccurrence
                          const leadProfileHref = job.series?.lead_id ? `/app/leads/${job.series.lead_id}?return=/app/todo` : null
                          return (
                            <div key={job.id} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-medium truncate">{job.series?.lead?.name || 'Customer'} • {job.series?.title || 'Job'}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">{format(new Date(job.start_at), 'EEE, MMM d • h:mm a')}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {leadProfileHref && (
                                  <a href={leadProfileHref}><Button size="sm" variant="ghost">Profile</Button></a>
                                )}
                                <Button size="sm" variant="primary" onClick={() => handleMarkJobComplete(job.id)}>Complete ✓</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDismissItem(key)}>✕</Button>
                              </div>
                            </div>
                          )
                        }
                        
                        if (section.type === 'past_due_unpaid') {
                          const job = item as JobOccurrence
                          const leadProfileHref = job.series?.lead_id ? `/app/leads/${job.series.lead_id}?return=/app/todo` : null
                          return (
                            <div key={job.id} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-medium truncate">{job.series?.lead?.name || 'Customer'} • {job.series?.title || 'Job'}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">Due: {format(new Date(job.start_at), 'MMM d, yyyy')}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {leadProfileHref && (
                                  <a href={leadProfileHref}><Button size="sm" variant="ghost">Profile</Button></a>
                                )}
                                <Button size="sm" variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('open-job-modal', { detail: { occurrenceId: job.id } }))}>View Job</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDismissItem(key)}>✕</Button>
                              </div>
                            </div>
                          )
                        }
                        
                        if (section.type === 'cleaner_payout') {
                          const payout = item as CleanerPayout
                          return (
                            <div key={payout.id} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-medium truncate">{(payout.cleaner as any)?.full_name || 'Cleaner'}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">{(payout.occurrence as any)?.series?.title || 'Job'} • ${payout.payout_amount.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="primary" onClick={() => handleMarkPayoutPaid(payout.id)}>Mark Paid ✓</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDismissItem(key)}>✕</Button>
                              </div>
                            </div>
                          )
                        }
                        
                        return null
                      })
                    )}
                  </div>
                </GlassCard>
              )
            })}
          </div>

          {/* Manual Todos */}
          <div>
            <GlassCard className="overflow-hidden">
              <div className="p-4 border-b border-[var(--glass-border)] bg-cyan-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✏️</span>
                    <h2 className="font-semibold text-cyan-400">Manual Todos</h2>
                    {todosTableUnavailable && <Badge variant="warning">Syncing...</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    {(['all', 'pending', 'completed'] as const).map(f => (
                      <Button key={f} size="sm" variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
                        {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Done'}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add Todo Form */}
              <div className="p-4 border-b border-[var(--glass-border)] bg-[var(--color-surface)]">
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="input w-full"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddManualTodo() } }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTodoDescription}
                      onChange={(e) => setNewTodoDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className="input flex-1"
                    />
                    <Button onClick={handleAddManualTodo} loading={isAddingTodo} disabled={!newTodoTitle.trim()} variant="primary">
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* Todos List */}
              <div className="p-3 max-h-[400px] overflow-y-auto space-y-2">
                {isLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
                ) : todosTableUnavailable ? (
                  <div className="py-8 text-center text-amber-300 text-sm">⏳ Syncing with database...</div>
                ) : filteredManualTodos.length === 0 ? (
                  <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">
                    {filter === 'pending' ? 'No pending todos!' : filter === 'completed' ? 'No completed todos' : 'No todos yet'}
                  </div>
                ) : (
                  filteredManualTodos.map(todo => (
                    <div
                      key={todo.id}
                      className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                        todo.is_completed ? 'bg-[var(--color-surface)] border-[var(--glass-border)] opacity-60' : 'bg-[var(--color-surface)] border-[var(--glass-border)]'
                      }`}
                    >
                      <button
                        onClick={() => handleToggleManualTodo(todo)}
                        className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          todo.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[var(--glass-border)] hover:border-cyan-400'
                        }`}
                      >
                        {todo.is_completed && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${todo.is_completed ? 'text-[var(--color-text-muted)] line-through' : 'text-white'}`}>
                          {todo.title}
                        </p>
                        {todo.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{todo.description}</p>}
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                          Added {format(new Date(todo.created_at), 'MMM d, h:mm a')}
                          {todo.completed_at && ` • Done ${format(new Date(todo.completed_at), 'MMM d')}`}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteManualTodo(todo.id)}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useTodoCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const handleUpdate = (e: CustomEvent<{ count: number }>) => setCount(e.detail.count)
    window.addEventListener('todo-count-update', handleUpdate as any)
    return () => window.removeEventListener('todo-count-update', handleUpdate as any)
  }, [])
  return count
}

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type NotificationItem = {
  id: string
  channel: 'sms' | 'email'
  step: number
  leadName: string
  createdAt: string
}

const DISMISS_AFTER_MS = 6000

export default function MarketingLoopNotifier() {
  const { currentOrg } = useAuth()
  const [queue, setQueue] = useState<NotificationItem[]>([])
  const timeoutsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!currentOrg) return

    const pushNotification = async (payload: any) => {
      const log = payload?.new
      if (!log?.run_id || log?.status !== 'success') return
      if (log?.action_type !== 'send_sms' && log?.action_type !== 'send_email') return

      const { data: run } = await supabase
        .from('workflow_runs')
        .select('entity_type, entity_id, workflow:workflows(system_key)')
        .eq('org_id', currentOrg.id)
        .eq('id', log.run_id)
        .maybeSingle()

      const workflow = Array.isArray((run as any)?.workflow) ? (run as any)?.workflow[0] : (run as any)?.workflow
      const systemKey = workflow?.system_key as string | undefined
      if (systemKey !== 'marketing_sms' && systemKey !== 'marketing_email') return
      if ((run as any)?.entity_type !== 'lead' || !(run as any)?.entity_id) return

      const channel: 'sms' | 'email' = log.action_type === 'send_sms' ? 'sms' : 'email'

      const { data: lead } = await supabase
        .from('extracted_leads')
        .select('name')
        .eq('org_id', currentOrg.id)
        .eq('id', (run as any).entity_id)
        .maybeSingle()

      const leadName = lead?.name || 'Unknown lead'
      const entityId = String((run as any).entity_id)
      const id = `${channel}-${log.id || `${entityId}-${log.step_order}-${Date.now()}`}`
      const item: NotificationItem = {
        id,
        channel,
        step: Number(log.step_order || 1),
        leadName,
        createdAt: log.created_at || new Date().toISOString(),
      }

      setQueue((prev) => [...prev, item])
      const timeoutId = window.setTimeout(() => {
        setQueue((prev) => prev.filter((entry) => entry.id !== id))
        timeoutsRef.current.delete(id)
      }, DISMISS_AFTER_MS)
      timeoutsRef.current.set(id, timeoutId)
    }

    const channel = supabase
      .channel('marketing_loop_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workflow_step_logs', filter: 'org_id=eq.' + currentOrg.id },
        (payload) => pushNotification(payload)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      timeoutsRef.current.clear()
    }
  }, [currentOrg])

  if (queue.length === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-[1900] flex flex-col gap-2 max-w-xs w-[90vw]">
      {queue.slice(-3).map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 shadow-lg shadow-yellow-500/20 px-3 py-2 text-sm text-yellow-100 backdrop-blur"
        >
          Marketing Loop {item.channel.toUpperCase()} Sent Step {item.step} to {item.leadName}
        </div>
      ))}
    </div>
  )
}

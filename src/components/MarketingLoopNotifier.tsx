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

    const pushNotification = async (payload: any, channel: 'sms' | 'email') => {
      const log = payload?.new
      if (!log?.lead_id || log?.status !== 'sent') return

      const { data: lead } = await supabase
        .from('extracted_leads')
        .select('name')
        .eq('org_id', currentOrg.id)
        .eq('id', log.lead_id)
        .maybeSingle()

      const leadName = lead?.name || 'Unknown lead'
      const id = `${channel}-${log.id || `${log.lead_id}-${log.step}-${Date.now()}`}`
      const item: NotificationItem = {
        id,
        channel,
        step: Number(log.step || 1),
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
        { event: 'INSERT', schema: 'public', table: 'marketing_sms_logs', filter: 'org_id=eq.' + currentOrg.id },
        (payload) => pushNotification(payload, 'sms')
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'marketing_email_logs', filter: 'org_id=eq.' + currentOrg.id },
        (payload) => pushNotification(payload, 'email')
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

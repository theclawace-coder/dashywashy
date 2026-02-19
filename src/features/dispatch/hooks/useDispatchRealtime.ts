import { useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export function useDispatchRealtime(
  orgId: string | null | undefined,
  onRefresh: () => Promise<void> | void
) {
  useEffect(() => {
    if (!orgId) return

    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        void onRefresh()
      }, 250)
    }

    const channel = supabase
      .channel(`dispatch-v2-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_occurrences',
          filter: `org_id=eq.${orgId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_series',
          filter: `org_id=eq.${orgId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cleaners',
          filter: `org_id=eq.${orgId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cleaner_job_reviews',
          filter: `org_id=eq.${orgId}`,
        },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [orgId, onRefresh])
}


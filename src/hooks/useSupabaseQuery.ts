// ---------------------------------------------------------------------------
// useSupabaseQuery – org-scoped data fetching with optional realtime
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface UseSupabaseQueryOptions {
  /** Columns / joins to select (default: '*') */
  select?: string
  /** Additional filters applied after the automatic org_id filter */
  filter?: (query: any) => any
  /** Column name to order by */
  orderBy?: string
  /** Sort direction – true = ascending (default: false) */
  ascending?: boolean
  /** Max rows to return */
  limit?: number
  /** Subscribe to realtime INSERT / UPDATE / DELETE events on this table */
  realtime?: boolean
  /** Skip the query entirely when false (default: true) */
  enabled?: boolean
}

export interface UseSupabaseQueryResult<T> {
  data: T[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useSupabaseQuery<T = any>(
  table: string,
  options: UseSupabaseQueryOptions = {}
): UseSupabaseQueryResult<T> {
  const {
    select = '*',
    filter,
    orderBy,
    ascending = false,
    limit,
    realtime = false,
    enabled = true,
  } = options

  const { currentOrg } = useAuth()
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Keep a stable ref to the channel so we can unsubscribe on cleanup
  const channelRef = useRef<RealtimeChannel | null>(null)

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!currentOrg || !enabled) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from(table)
        .select(select)
        .eq('org_id', currentOrg.id)

      if (filter) {
        query = filter(query)
      }

      if (orderBy) {
        query = query.order(orderBy, { ascending })
      }

      if (limit !== undefined) {
        query = query.limit(limit)
      }

      const { data: rows, error: queryError } = await query

      if (queryError) {
        throw new Error(queryError.message)
      }

      setData((rows as T[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [table, select, filter, orderBy, ascending, limit, currentOrg, enabled])

  // -----------------------------------------------------------------------
  // Initial fetch + re-fetch when dependencies change
  // -----------------------------------------------------------------------

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // -----------------------------------------------------------------------
  // Realtime subscription
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!realtime || !currentOrg || !enabled) return

    const channel = supabase
      .channel(`${table}_org_${currentOrg.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table,
          filter: `org_id=eq.${currentOrg.id}`,
        },
        () => {
          // Re-fetch the full dataset on any change to keep state consistent
          fetchData()
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [realtime, table, currentOrg, enabled, fetchData])

  return { data, loading, error, refetch: fetchData }
}

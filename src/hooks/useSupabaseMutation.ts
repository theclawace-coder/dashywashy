// ---------------------------------------------------------------------------
// useSupabaseMutation – org-scoped insert / update / upsert / delete helpers
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function useSupabaseMutation(table: string) {
  const { currentOrg } = useAuth()

  /** Insert one or many rows, automatically injecting org_id. */
  const insert = async (data: Record<string, any> | Record<string, any>[]) => {
    if (!currentOrg) throw new Error('No organization selected')

    const rows = Array.isArray(data)
      ? data.map((r) => ({ ...r, org_id: currentOrg.id }))
      : { ...data, org_id: currentOrg.id }

    return supabase.from(table).insert(rows)
  }

  /** Update a single row by id, scoped to the current org. */
  const update = async (id: string, data: Record<string, any>) => {
    if (!currentOrg) throw new Error('No organization selected')

    return supabase
      .from(table)
      .update(data)
      .eq('id', id)
      .eq('org_id', currentOrg.id)
  }

  /** Upsert one or many rows, automatically injecting org_id. */
  const upsert = async (data: Record<string, any> | Record<string, any>[]) => {
    if (!currentOrg) throw new Error('No organization selected')

    const rows = Array.isArray(data)
      ? data.map((r) => ({ ...r, org_id: currentOrg.id }))
      : { ...data, org_id: currentOrg.id }

    return supabase.from(table).upsert(rows)
  }

  /** Delete a single row by id, scoped to the current org. */
  const remove = async (id: string) => {
    if (!currentOrg) throw new Error('No organization selected')

    return supabase
      .from(table)
      .delete()
      .eq('id', id)
      .eq('org_id', currentOrg.id)
  }

  return { insert, update, upsert, remove }
}

import { supabase, supabaseAnonKey, supabaseUrl } from './supabase'

let cachedToken: string | null = null
let cachedOrgId: string | null = null
let inFlight: Promise<string> | null = null

/**
 * Fetch the Mapbox token from a Supabase Edge Function backed by Supabase secrets.
 * Falls back to VITE_MAPBOX_TOKEN for local/dev if the function is unavailable.
 */
export async function fetchMapboxToken(orgId?: string | null): Promise<string> {
  if (cachedToken && (!orgId || cachedOrgId === orgId)) return cachedToken
  if (inFlight) return inFlight

  inFlight = (async () => {
    // Prefer local env token (matches Cleaners and helps local dev / domain-restricted tokens)
    const envToken = import.meta.env.VITE_MAPBOX_TOKEN
    if (envToken && typeof envToken === 'string') {
      cachedToken = envToken
      cachedOrgId = orgId ?? null
      return cachedToken
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/get-mapbox-token`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.token) {
        throw new Error(data?.error || 'Failed to load Mapbox token')
      }
      cachedToken = data.token as string
      cachedOrgId = orgId ?? null
      return cachedToken
    } catch (err) {
      throw err instanceof Error ? err : new Error('Unable to load Mapbox token')
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}


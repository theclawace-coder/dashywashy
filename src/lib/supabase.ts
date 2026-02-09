import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables'
  )
}

export { supabaseUrl, supabaseAnonKey }

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const GET_SESSION_TIMEOUT_MS = 1200

const getProjectRefFromSupabaseUrl = (url: string) => {
  try {
    const hostname = new URL(url).hostname
    if (!hostname) return null
    if (hostname === 'localhost') return 'localhost'
    const first = hostname.split('.')[0]
    return first || null
  } catch {
    return null
  }
}

const getExpectedAuthStorageKey = () => {
  const projectRef = getProjectRefFromSupabaseUrl(supabaseUrl)
  return projectRef ? `sb-${projectRef}-auth-token` : null
}

const normalizeStoredSession = (parsed: any) => {
  if (!parsed) return null
  if (parsed?.access_token && parsed?.refresh_token) return parsed
  if (parsed?.currentSession?.access_token && parsed?.currentSession?.refresh_token) return parsed.currentSession
  return null
}

const isLikelyExpired = (session: any) => {
  const expiresAt = session?.expires_at
  if (typeof expiresAt !== 'number') return false
  return expiresAt * 1000 <= Date.now() + 5000
}

const readStoredSession = () => {
  if (typeof window === 'undefined') return null
  try {
    const keys = Object.keys(window.localStorage)
    const expectedKey = getExpectedAuthStorageKey()

    const candidateKeys: string[] = []
    if (expectedKey) {
      candidateKeys.push(expectedKey)
    }

    const sbAuthTokenKeys = keys.filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!expectedKey) {
      if (sbAuthTokenKeys.length === 1) {
        candidateKeys.push(sbAuthTokenKeys[0])
      } else if (sbAuthTokenKeys.length > 1) {
        console.warn('[supabase] Multiple auth tokens found; refusing ambiguous fallback:', sbAuthTokenKeys)
        return null
      }
    }

    const key = candidateKeys.find((k) => window.localStorage.getItem(k))
    if (!key) return null

    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const session = normalizeStoredSession(parsed)
    if (!session) return null
    if (isLikelyExpired(session)) return null
    return session
  } catch (err) {
    console.warn('[supabase] Failed to read stored session:', err)
  }
  return null
}

const originalGetSession = supabase.auth.getSession.bind(supabase.auth)
supabase.auth.getSession = async () => {
  const storedSession = readStoredSession()
  if (storedSession) {
    // Return cached session immediately to avoid UI stalls.
    // Fire-and-forget a real getSession to refresh storage in the background.
    void originalGetSession().catch((err) => {
      console.warn('[supabase] getSession background refresh failed:', err)
    })
    return { data: { session: storedSession }, error: null } as Awaited<ReturnType<typeof originalGetSession>>
  }

  try {
    const result = await Promise.race([
      originalGetSession(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('getSession timed out')), GET_SESSION_TIMEOUT_MS)
      ),
    ])
    if (result && typeof result === 'object' && 'data' in result) {
      return result as Awaited<ReturnType<typeof originalGetSession>>
    }
  } catch (err) {
    console.warn('[supabase] getSession fallback:', err)
  }

  return { data: { session: null }, error: null } as Awaited<ReturnType<typeof originalGetSession>>
}

export type DialpadCall = {
  id: string
  call_id: string
  direction: 'inbound' | 'outbound'
  duration: number
  created_at: string
  transcript?: string | null
  summary?: string | null
  transcript_fetched_at?: string | null
  external_number?: string | null
  internal_number?: string | null
}

export type DialpadSms = {
  id: string
  message_id: string
  direction: 'inbound' | 'outbound'
  created_at: string
  content?: string | null
  summary?: string | null
  external_number?: string | null
  internal_number?: string | null
}

export type DialpadEmail = {
  id: string
  message_id: string
  direction: 'inbound' | 'outbound'
  subject: string | null
  from_email: string | null
  to_email: string | null
  created_at: string
  body?: string | null
  summary?: string | null
}

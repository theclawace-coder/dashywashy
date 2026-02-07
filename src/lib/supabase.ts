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

const GET_SESSION_TIMEOUT_MS = 3000

const readStoredSession = () => {
  if (typeof window === 'undefined') return null
  try {
    const key = Object.keys(window.localStorage).find((k) => k.includes('auth-token'))
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.access_token && parsed?.refresh_token) {
      return parsed
    }
  } catch (err) {
    console.warn('[supabase] Failed to read stored session:', err)
  }
  return null
}

const originalGetSession = supabase.auth.getSession.bind(supabase.auth)
supabase.auth.getSession = async () => {
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

  const storedSession = readStoredSession()
  return { data: { session: storedSession }, error: null } as Awaited<ReturnType<typeof originalGetSession>>
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

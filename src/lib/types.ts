// ---------------------------------------------------------------------------
// Shared TypeScript types for the multi-tenant organisation system
// ---------------------------------------------------------------------------

export type OrgRole = 'owner' | 'admin' | 'manager' | 'staff' | 'cleaner'
export type OrgPlan = 'free' | 'growth' | 'unlimited'

export interface Organization {
  id: string
  name: string
  slug: string
  business_name: string
  business_abn: string | null
  business_phone: string | null
  business_email: string | null
  business_operating_name: string | null
  bank_account_name: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  timezone: string
  currency: string
  default_client_hourly_rate: number
  default_cleaner_hourly_rate: number
  gst_rate: number
  default_discount_pct: number
  default_deposit_pct: number
  logo_url: string | null
  primary_color: string | null
  plan: OrgPlan
  max_users: number
  max_cleaners: number
  use_workflow_automations?: boolean | null
  created_at: string
  updated_at: string
}

export interface OrgMembership {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  display_name: string | null
  organization: Organization
}

export interface OrgInvite {
  id: string
  org_id: string
  email: string
  role: OrgRole
  token: string
  expires_at: string
  accepted_at: string | null
  organization?: Organization
}

export interface OrgIntegration {
  id: string
  org_id: string
  provider: string
  config: Record<string, string>
  enabled: boolean
}

// Re-export communication types that live in supabase.ts so consumers can
// import everything from a single module when convenient.
export type { DialpadCall, DialpadSms, DialpadEmail } from './supabase'

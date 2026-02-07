import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// ===========================================================================
// INLINED FROM _shared/org-resolver.ts
// ===========================================================================

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-org-id, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function jsonError(message: string, status = 400) {
  return jsonResponse({ error: message }, status)
}

export interface OrgContext {
  orgId: string
  userId: string
  userEmail: string
  role: string
  supabaseAdmin: ReturnType<typeof createClient>
  org: Record<string, unknown>
}

export async function resolveOrgFromRequest(req: Request): Promise<OrgContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }
  const token = authHeader.replace('Bearer ', '')

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const headerOrgId = req.headers.get('X-Org-Id')
  if (token === serviceRoleKey && headerOrgId) {
    const org = await getOrg(supabaseAdmin, headerOrgId)
    return {
      orgId: headerOrgId,
      userId: 'service-account',
      userEmail: 'service@internal',
      role: 'service',
      supabaseAdmin,
      org,
    }
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    throw new Error('Unauthorized')
  }

  const userId = user.id
  const userEmail = user.email || ''

  let orgId: string | null = null

  if (headerOrgId) {
    orgId = headerOrgId
  }

  if (!orgId) {
    const { data: pref } = await supabaseAdmin
      .from('user_preferences')
      .select('current_org_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (pref?.current_org_id) {
      orgId = pref.current_org_id
    }
  }

  if (!orgId) {
    const { data: firstMember } = await supabaseAdmin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstMember?.org_id) {
      orgId = firstMember.org_id
    }
  }

  if (!orgId) {
    throw new Error('No organization found for this user')
  }

  const { data: membership, error: memberError } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (memberError || !membership) {
    throw new Error('You are not a member of this organization')
  }

  const org = await getOrg(supabaseAdmin, orgId)

  return {
    orgId,
    userId,
    userEmail,
    role: membership.role,
    supabaseAdmin,
    org,
  }
}

export async function getOrgIntegration(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  provider: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('organization_integrations')
    .select('config')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('enabled', true)
    .maybeSingle()

  if (error || !data?.config) {
    return {}
  }

  return data.config as Record<string, string>
}

export async function getOrg(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()

  if (error || !data) {
    throw new Error('Organization not found')
  }

  return data as Record<string, unknown>
}

export async function getAutomationSetting(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  automationType: string,
): Promise<{ enabled: boolean; config: Record<string, unknown> }> {
  const { data, error } = await supabaseAdmin
    .from('organization_automation_settings')
    .select('enabled, config')
    .eq('org_id', orgId)
    .eq('automation_type', automationType)
    .maybeSingle()

  if (error || !data) {
    return { enabled: true, config: {} }
  }

  return {
    enabled: data.enabled ?? true,
    config: (data.config as Record<string, unknown>) || {},
  }
}

// ===========================================================================
// INLINED FROM _shared/quote-calculator.ts
// ===========================================================================

export type ServiceType = 'general' | 'deep' | 'move'

export const SERVICE_HOURS: Record<ServiceType, Record<string, number>> = {
  general: {
    '1,1': 2.0, '2,1': 2.5, '2,2': 3.5, '3,2': 4.0,
    '4,2': 4.75, '4,3': 5.75, '5,3': 6.5, '6,3': 7.0,
  },
  deep: {
    '1,1': 3.5, '2,1': 4.0, '2,2': 5.0, '3,2': 6.0,
    '4,2': 7.25, '4,3': 8.5, '5,3': 9.75, '6,3': 11.0,
  },
  move: {
    '1,1': 5.0, '2,1': 6.0, '2,2': 7.0, '3,2': 8.0,
    '4,2': 9.5, '4,3': 10.5, '5,3': 11.0, '6,3': 12.5,
  },
}

export const STANDARD_ADD_ONS: Record<string, number> = {
  inside_oven_clean: 0.75,
  inside_fridge_clean: 0.75,
  inside_freezer_clean: 0.75,
  inside_windows_and_tracks: 1.5,
  blinds_up_to_5_sets: 0.75,
  balcony_clean: 0.75,
  garage_sweep_and_cobwebs: 0.75,
  carpet_steam_clean_1_room: 1.0,
  wall_spot_cleaning: 1.0,
  extra_bathroom: 1.0,
  extra_bedroom: 1.0,
}

export const ADDON_DISPLAY_NAMES: Record<string, string> = {
  inside_oven_clean: 'Inside Oven Clean',
  inside_fridge_clean: 'Inside Fridge Clean',
  inside_freezer_clean: 'Inside Freezer Clean',
  inside_windows_and_tracks: 'Inside Windows & Tracks',
  blinds_up_to_5_sets: 'Blinds (up to 5 sets)',
  balcony_clean: 'Balcony Clean',
  garage_sweep_and_cobwebs: 'Garage Sweep & Cobwebs',
  carpet_steam_clean_1_room: 'Carpet Steam Clean (1 room)',
  wall_spot_cleaning: 'Wall Spot Cleaning',
  extra_bathroom: 'Extra Bathroom',
  extra_bedroom: 'Extra Bedroom',
}

export const DEFAULT_PRICING = {
  CLIENT_HOURLY_RATE: 60,
  CLEANER_HOURLY_RATE: 35,
  GST_RATE: 0.1,
  DEFAULT_DISCOUNT_PCT: 10,
  DEFAULT_DEPOSIT_PCT: 0,
}

export type CustomAddOn = { name: string; price: number }

export type QuoteInput = {
  service: ServiceType
  bedrooms: number
  bathrooms: number
  addons: string[]
  customAddons: CustomAddOn[]
  clientHourlyRate: number
  cleanerHourlyRate: number
  cleanerRateType: 'hour' | 'job'
  discountApplied: boolean
  discountPercentage: number
  depositPercentage: number
}

export type QuoteResult = {
  mainServiceHours: number
  mainServiceCost: number
  addOnBreakdown: { key: string; hours: number; cost: number }[]
  totalAddOnHours: number
  totalAddOnCost: number
  totalCustomAddOnCost: number
  subtotal: number
  discountAmount: number
  netRevenue: number
  gst: number
  totalIncGst: number
  totalLaborHours: number
  cleanerPay: number
  profit: number
  profitMarginPct: number
  profitPerHour: number
  depositAmount: number
  remainingBalance: number
}

const round2 = (value: number) => Number(value.toFixed(2))
const round1 = (value: number) => Number(value.toFixed(1))

function validatePercent(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100`)
  }
}

function validatePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
}

function getMainServiceHours(service: ServiceType, bedrooms: number, bathrooms: number) {
  const key = `${bedrooms},${bathrooms}`
  const hours = SERVICE_HOURS[service]?.[key]
  if (!hours) {
    throw new Error(`Invalid bed/bath combo (${bedrooms} bed, ${bathrooms} bath) for ${service} service`)
  }
  return hours
}

export function calculateQuote(input: QuoteInput): QuoteResult {
  if (!['general', 'deep', 'move'].includes(input.service)) {
    throw new Error('Invalid service type')
  }

  validatePositive(input.clientHourlyRate, 'Client hourly rate')
  validatePositive(
    input.cleanerHourlyRate,
    input.cleanerRateType === 'job' ? 'Cleaner job pay' : 'Cleaner hourly rate'
  )
  validatePercent(input.discountPercentage, 'Discount percentage')
  validatePercent(input.depositPercentage, 'Deposit percentage')

  const mainServiceHours = getMainServiceHours(input.service, input.bedrooms, input.bathrooms)

  const addOnBreakdown = input.addons.map((key) => {
    const hours = STANDARD_ADD_ONS[key]
    if (!hours) {
      throw new Error(`Invalid add-on: ${key}`)
    }
    return { key, hours, cost: round2(hours * input.clientHourlyRate) }
  })

  const totalAddOnHours = addOnBreakdown.reduce((sum, item) => sum + item.hours, 0)
  const totalAddOnCost = addOnBreakdown.reduce((sum, item) => sum + item.cost, 0)

  const cleanedCustomAddons = (input.customAddons || []).map((addon) => ({
    name: addon.name?.trim() || 'Custom add-on',
    price: Math.max(0, Number(addon.price) || 0),
  }))
  cleanedCustomAddons.forEach((addon) => {
    if (!Number.isFinite(addon.price) || addon.price < 0) {
      throw new Error('Custom add-on prices must be zero or greater')
    }
  })

  const totalCustomAddOnCost = cleanedCustomAddons.reduce((sum, addon) => sum + addon.price, 0)

  const mainServiceCost = round2(mainServiceHours * input.clientHourlyRate)
  const subtotal = round2(mainServiceCost + totalAddOnCost + totalCustomAddOnCost)
  const discountAmount = input.discountApplied ? round2(subtotal * (input.discountPercentage / 100)) : 0
  const netRevenue = round2(subtotal - discountAmount)
  const gst = round2(netRevenue * DEFAULT_PRICING.GST_RATE)
  const totalIncGst = round2(netRevenue + gst)

  const totalLaborHours = mainServiceHours + totalAddOnHours
  const cleanerPay =
    input.cleanerRateType === 'job'
      ? round2(input.cleanerHourlyRate)
      : round2(totalLaborHours * input.cleanerHourlyRate)
  const profit = round2(netRevenue - cleanerPay)
  const profitMarginPct = netRevenue > 0 ? round1((profit / netRevenue) * 100) : 0
  const profitPerHour = totalLaborHours > 0 ? round2(profit / totalLaborHours) : 0

  const depositAmount = round2(totalIncGst * (input.depositPercentage / 100))
  const remainingBalance = round2(totalIncGst - depositAmount)

  return {
    mainServiceHours: round2(mainServiceHours),
    mainServiceCost,
    addOnBreakdown,
    totalAddOnHours: round2(totalAddOnHours),
    totalAddOnCost: round2(totalAddOnCost),
    totalCustomAddOnCost: round2(totalCustomAddOnCost),
    subtotal,
    discountAmount,
    netRevenue,
    gst,
    totalIncGst,
    totalLaborHours: round2(totalLaborHours),
    cleanerPay,
    profit,
    profitMarginPct,
    profitPerHour,
    depositAmount,
    remainingBalance,
  }
}

export function generateQuoteNumber(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const letter = letters[Math.floor(Math.random() * letters.length)]
  const number = Math.floor(1000 + Math.random() * 9000)
  return `${letter}${number}`
}

export function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 16; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

// ===========================================================================
// AI ASSISTANT CODE CONTINUES BELOW
// ===========================================================================


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

interface PendingConfirmation {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  preview: Record<string, unknown>
}

interface RequestPayload {
  messages: ChatMessage[]
  confirmAction?: {
    toolCallId: string
    confirmed: boolean
    toolName?: string
    arguments?: Record<string, unknown>
    preview?: Record<string, unknown>
  }
}

// ---------------------------------------------------------------------------
// Tool Definitions for OpenAI Function Calling
// ---------------------------------------------------------------------------

const QUERY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_bookings',
      description: 'Fetch booking occurrences (scheduled cleans/jobs) for a date range. Use this to answer questions about scheduled jobs, upcoming cleans, or calendar availability.',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format. Defaults to today if not provided.'
          },
          endDate: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format. Defaults to 7 days from startDate.'
          },
          cleanerName: {
            type: 'string',
            description: 'Filter by cleaner name (partial match supported)'
          },
          customerName: {
            type: 'string',
            description: 'Filter by customer/lead name (partial match supported)'
          },
          status: {
            type: 'string',
            enum: ['scheduled', 'completed', 'cancelled', 'skipped'],
            description: 'Filter by booking status'
          },
          unassignedOnly: {
            type: 'boolean',
            description: 'If true, only return bookings without a cleaner assigned'
          },
          unpaidOnly: {
            type: 'boolean',
            description: 'If true, only return completed bookings that are not yet paid'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_leads',
      description: 'Search and filter leads/customers. Use this to find customer information, check lead status, or look up contact details.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search query to match against name, email, or phone number'
          },
          status: {
            type: 'string',
            enum: ['Inquiry', 'Quoted', 'Quote Sent', 'Quote Accepted', 'Booking Confirmed', 'Marketing Loop', 'Lost', 'DNQ', 'No Further Contact'],
            description: 'Filter by lead status'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 10, max 50)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_quotes',
      description: 'Fetch quotes. Use this to find quote details, pricing information, or quote status.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Filter by customer/lead name (partial match)'
          },
          quoteNumber: {
            type: 'string',
            description: 'Find a specific quote by number'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default 10, max 50)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_cleaners',
      description: 'List cleaners and their availability. Use this to find available cleaners or check cleaner details.',
      parameters: {
        type: 'object',
        properties: {
          activeOnly: {
            type: 'boolean',
            description: 'If true, only return active cleaners (default true)'
          },
          search: {
            type: 'string',
            description: 'Search by cleaner name'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_crm',
      description: 'Global search across leads, bookings, quotes, and cleaners. Use when the user wants to find something but you are unsure which entity type.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_pricing_rules',
      description: 'Get pricing information including service hours lookup table, add-on options with hours, and default rates. Use this when asked about pricing or before creating a quote.',
      parameters: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            enum: ['general', 'deep', 'move'],
            description: 'Optional: filter to a specific service type'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_org_settings',
      description: 'Get organization settings including default hourly rates, GST rate, deposit percentage, and business details.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_communications_log',
      description: 'Get SMS, call, and email history for a customer. Use this to see past communication with a lead.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to search for'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          type: {
            type: 'string',
            enum: ['sms', 'call', 'email', 'all'],
            description: 'Filter by communication type (default: all)'
          },
          limit: {
            type: 'number',
            description: 'Maximum records to return (default 20)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_marketing_status',
      description: 'Check the marketing automation status for a lead - whether they are in an SMS or email marketing journey.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to search for'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          }
        },
        required: []
      }
    }
  }
]

const ACTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_quote_email',
      description: 'Send a quote to a customer via email. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the quote for'
          },
          quoteId: {
            type: 'string',
            description: 'Specific quote ID if known'
          },
          emailOverride: {
            type: 'string',
            description: 'Override email address (optional)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_sms',
      description: 'Send an SMS message to a phone number. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to look up phone number'
          },
          phoneNumber: {
            type: 'string',
            description: 'Phone number if known'
          },
          message: {
            type: 'string',
            description: 'The SMS message to send'
          }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_cleaner',
      description: 'Assign a cleaner to a booking. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          jobDate: {
            type: 'string',
            description: 'Date of the job (YYYY-MM-DD)'
          },
          cleanerName: {
            type: 'string',
            description: 'Name of the cleaner to assign'
          },
          occurrenceId: {
            type: 'string',
            description: 'Specific booking occurrence ID if known'
          }
        },
        required: ['cleanerName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_booking_status',
      description: 'Update the status of a booking (e.g., mark as completed or cancelled). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          jobDate: {
            type: 'string',
            description: 'Date of the job (YYYY-MM-DD)'
          },
          newStatus: {
            type: 'string',
            enum: ['scheduled', 'completed', 'cancelled', 'skipped'],
            description: 'New status for the booking'
          },
          occurrenceId: {
            type: 'string',
            description: 'Specific booking occurrence ID if known'
          }
        },
        required: ['newStatus']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_lead_status',
      description: 'Update the status of a lead. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer/lead name'
          },
          leadId: {
            type: 'string',
            description: 'Specific lead ID if known'
          },
          newStatus: {
            type: 'string',
            enum: ['Inquiry', 'Quoted', 'Quote Sent', 'Quote Accepted', 'Booking Confirmed', 'Marketing Loop', 'Lost', 'DNQ', 'No Further Contact'],
            description: 'New status for the lead'
          }
        },
        required: ['newStatus']
      }
    }
  },
  // === NEW DATA CREATION TOOLS ===
  {
    type: 'function',
    function: {
      name: 'create_lead',
      description: 'Create a new customer/lead in the CRM. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Customer full name (required)'
          },
          phone: {
            type: 'string',
            description: 'Phone number (Australian format preferred, e.g., 0412345678 or +61412345678)'
          },
          email: {
            type: 'string',
            description: 'Email address'
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the customer or their inquiry'
          },
          status: {
            type: 'string',
            enum: ['Inquiry', 'Quoted', 'Quote Sent', 'Quote Accepted', 'Booking Confirmed', 'Marketing Loop', 'Lost', 'DNQ', 'No Further Contact'],
            description: 'Initial status (default: Inquiry)'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_quote',
      description: 'Create a quote for a customer with automatic pricing calculation. REQUIRES CONFIRMATION before executing. Use get_pricing_rules first to understand available services and add-ons.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the lead'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          address: {
            type: 'string',
            description: 'Service address (full Australian address)'
          },
          service: {
            type: 'string',
            enum: ['general', 'deep', 'move'],
            description: 'Service type: general (regular clean), deep (thorough clean), move (end of lease/move in-out)'
          },
          bedrooms: {
            type: 'number',
            description: 'Number of bedrooms (1-6)'
          },
          bathrooms: {
            type: 'number',
            description: 'Number of bathrooms (1-3)'
          },
          addons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Standard add-ons: inside_oven_clean, inside_fridge_clean, inside_freezer_clean, inside_windows_and_tracks, blinds_up_to_5_sets, balcony_clean, garage_sweep_and_cobwebs, carpet_steam_clean_1_room, wall_spot_cleaning, extra_bathroom, extra_bedroom'
          },
          customAddons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number' }
              }
            },
            description: 'Custom add-ons with fixed prices (e.g., [{name: "Pet hair removal", price: 50}])'
          },
          discountPercentage: {
            type: 'number',
            description: 'Discount percentage (0-100, default: 10)'
          },
          depositPercentage: {
            type: 'number',
            description: 'Deposit percentage required upfront (0-100, default: 0)'
          },
          notes: {
            type: 'string',
            description: 'Internal notes about the quote'
          },
          customerEmail: {
            type: 'string',
            description: 'Customer email (overrides lead email)'
          },
          customerPhone: {
            type: 'string',
            description: 'Customer phone (overrides lead phone)'
          }
        },
        required: ['service', 'bedrooms', 'bathrooms']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description: 'Schedule cleaning jobs from a quote. Creates recurring or one-off bookings. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the quote'
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID if known'
          },
          startDateTime: {
            type: 'string',
            description: 'First booking date and time in ISO format (e.g., 2026-02-15T09:00:00)'
          },
          repeatType: {
            type: 'string',
            enum: ['none', 'weekly', 'fortnightly', '3-weekly', 'monthly', '2-monthly'],
            description: 'Recurrence pattern (default: none = one-off)'
          },
          durationMinutes: {
            type: 'number',
            description: 'Duration in minutes (default: 120)'
          },
          untilDate: {
            type: 'string',
            description: 'End date for recurring bookings (YYYY-MM-DD format)'
          },
          occurrenceCount: {
            type: 'number',
            description: 'Number of occurrences to create (alternative to untilDate)'
          },
          notes: {
            type: 'string',
            description: 'Notes for the booking (e.g., access instructions)'
          }
        },
        required: ['startDateTime']
      }
    }
  },
  // === NEW COMMUNICATION TOOLS ===
  {
    type: 'function',
    function: {
      name: 'initiate_call',
      description: 'Start a phone call to a customer via Dialpad. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to look up phone number'
          },
          phoneNumber: {
            type: 'string',
            description: 'Phone number if known'
          }
        },
        required: []
      }
    }
  },
  // === NEW PAYMENT TOOLS ===
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description: 'Generate a Stripe payment link for a customer to pay. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find their quote or booking'
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID to create payment link for'
          },
          amountDollars: {
            type: 'number',
            description: 'Amount in AUD dollars (optional - uses quote total if not specified)'
          },
          description: {
            type: 'string',
            description: 'Payment description (optional)'
          }
        },
        required: []
      }
    }
  },
  // === NEW MARKETING TOOLS ===
  {
    type: 'function',
    function: {
      name: 'start_marketing_loop',
      description: 'Enroll a lead in the marketing automation sequence (SMS and/or email). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          journeyType: {
            type: 'string',
            enum: ['sms', 'email', 'both'],
            description: 'Type of marketing journey (default: both)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pause_marketing_loop',
      description: 'Pause the marketing automation for a lead. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          journeyType: {
            type: 'string',
            enum: ['sms', 'email', 'both'],
            description: 'Type of marketing journey to pause (default: both)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_marketing_loop',
      description: 'Cancel/stop the marketing automation for a lead entirely. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          journeyType: {
            type: 'string',
            enum: ['sms', 'email', 'both'],
            description: 'Type of marketing journey to cancel (default: both)'
          }
        },
        required: []
      }
    }
  },
  // === NEW SCHEDULING TOOLS ===
  {
    type: 'function',
    function: {
      name: 'reschedule_booking',
      description: 'Move a booking to a new date/time. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          currentDate: {
            type: 'string',
            description: 'Current date of the booking (YYYY-MM-DD)'
          },
          newDateTime: {
            type: 'string',
            description: 'New date and time in ISO format (e.g., 2026-02-20T14:00:00)'
          },
          occurrenceId: {
            type: 'string',
            description: 'Specific booking occurrence ID if known'
          }
        },
        required: ['newDateTime']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_booking_series',
      description: 'Cancel all future bookings in a series. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking series'
          },
          seriesId: {
            type: 'string',
            description: 'Booking series ID if known'
          },
          cancelFutureOnly: {
            type: 'boolean',
            description: 'If true, only cancel future occurrences (default: true)'
          }
        },
        required: []
      }
    }
  },
  // === NEW TOOLS - UPDATE/EDIT ===
  {
    type: 'function',
    function: {
      name: 'update_lead',
      description: 'Update customer/lead information (phone, email, address, notes). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the lead'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          newPhone: {
            type: 'string',
            description: 'New phone number'
          },
          newEmail: {
            type: 'string',
            description: 'New email address'
          },
          newAddress: {
            type: 'string',
            description: 'New address'
          },
          newNotes: {
            type: 'string',
            description: 'New notes (replaces existing notes)'
          },
          appendNotes: {
            type: 'string',
            description: 'Notes to append to existing notes'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_quote',
      description: 'Modify an existing quote (add/remove addons, change discount, update address). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the quote'
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID if known'
          },
          addAddons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Add-ons to add: inside_oven_clean, inside_fridge_clean, inside_freezer_clean, inside_windows_and_tracks, blinds_up_to_5_sets, balcony_clean, garage_sweep_and_cobwebs, carpet_steam_clean_1_room, wall_spot_cleaning, extra_bathroom, extra_bedroom'
          },
          removeAddons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Add-ons to remove'
          },
          newDiscountPercentage: {
            type: 'number',
            description: 'New discount percentage (0-100)'
          },
          newAddress: {
            type: 'string',
            description: 'New service address'
          },
          newNotes: {
            type: 'string',
            description: 'New internal notes'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_booking_paid',
      description: 'Record payment for a booking. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          jobDate: {
            type: 'string',
            description: 'Date of the job (YYYY-MM-DD)'
          },
          occurrenceId: {
            type: 'string',
            description: 'Booking occurrence ID if known'
          },
          paymentMethod: {
            type: 'string',
            enum: ['cash', 'card', 'bank_transfer', 'stripe'],
            description: 'How payment was received (default: cash)'
          },
          amount: {
            type: 'number',
            description: 'Amount paid in dollars (optional - uses booking total if not specified)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_booking',
      description: 'Update booking details (notes, service type, add-ons). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          jobDate: {
            type: 'string',
            description: 'Date of the job (YYYY-MM-DD)'
          },
          occurrenceId: {
            type: 'string',
            description: 'Booking occurrence ID if known'
          },
          newNotes: {
            type: 'string',
            description: 'New notes/instructions for the booking'
          },
          appendNotes: {
            type: 'string',
            description: 'Notes to append to existing notes'
          }
        },
        required: []
      }
    }
  }
]

// New query tools for analytics and cleaner schedule
const ADDITIONAL_QUERY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_cleaner_schedule',
      description: 'Get a specific cleaner\'s schedule/calendar for a date range.',
      parameters: {
        type: 'object',
        properties: {
          cleanerName: {
            type: 'string',
            description: 'Cleaner name to look up'
          },
          cleanerId: {
            type: 'string',
            description: 'Cleaner ID if known'
          },
          startDate: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD, default: today)'
          },
          endDate: {
            type: 'string',
            description: 'End date (YYYY-MM-DD, default: 7 days from start)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description: 'Get business analytics and metrics. Use this to answer questions about revenue, job counts, conversion rates, etc.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['revenue', 'jobs', 'leads', 'conversion', 'summary'],
            description: 'Type of analytics: revenue (money), jobs (booking counts), leads (lead counts by status), conversion (lead to booking rate), summary (overview of all)'
          },
          period: {
            type: 'string',
            enum: ['today', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year'],
            description: 'Time period for analytics (default: this_month)'
          }
        },
        required: []
      }
    }
  }
]

const ALL_TOOLS = [...QUERY_TOOLS, ...ADDITIONAL_QUERY_TOOLS, ...ACTION_TOOLS]

const ACTION_TOOL_NAMES = ACTION_TOOLS.map(t => t.function.name)

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

async function handleGetBookings(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId, org } = ctx
  const timezone = (org.timezone as string) || 'Australia/Sydney'

  // Parse dates
  const today = new Date()
  const startDateStr = (args.startDate as string) || today.toISOString().split('T')[0]
  const startDate = new Date(startDateStr + 'T00:00:00')

  let endDate: Date
  if (args.endDate) {
    endDate = new Date((args.endDate as string) + 'T23:59:59')
  } else {
    endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 7)
  }

  let query = supabaseAdmin
    .from('booking_occurrences')
    .select(`
      id,
      start_at,
      end_at,
      status,
      cleaner_id,
      payment_status,
      series:booking_series(
        id,
        title,
        service_address,
        lead:extracted_leads(id, name, phone_number, email)
      ),
      cleaner:cleaners(id, full_name, phone)
    `)
    .eq('org_id', orgId)
    .gte('start_at', startDate.toISOString())
    .lte('start_at', endDate.toISOString())
    .order('start_at', { ascending: true })
    .limit(30)

  if (args.status) {
    query = query.eq('status', args.status)
  }

  if (args.unassignedOnly === true) {
    query = query.is('cleaner_id', null)
  }

  if (args.unpaidOnly === true) {
    query = query.eq('status', 'completed').neq('payment_status', 'paid')
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  // Filter by cleaner name if provided
  let results = data || []
  if (args.cleanerName) {
    const cleanerSearch = (args.cleanerName as string).toLowerCase()
    results = results.filter((b: any) =>
      b.cleaner?.full_name?.toLowerCase().includes(cleanerSearch)
    )
  }

  // Filter by customer name if provided
  if (args.customerName) {
    const customerSearch = (args.customerName as string).toLowerCase()
    results = results.filter((b: any) =>
      b.series?.lead?.name?.toLowerCase().includes(customerSearch)
    )
  }

  // Format for readability
  const formatted = results.map((b: any) => ({
    id: b.id,
    date: new Date(b.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
    time: new Date(b.start_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }),
    status: b.status,
    paymentStatus: b.payment_status,
    customer: b.series?.lead?.name || 'Unknown',
    customerPhone: b.series?.lead?.phone_number || null,
    customerEmail: b.series?.lead?.email || null,
    address: b.series?.service_address || 'No address',
    title: b.series?.title || 'Cleaning',
    cleaner: b.cleaner?.full_name || 'Unassigned',
    cleanerPhone: b.cleaner?.phone || null
  }))

  return { success: true, data: { bookings: formatted, count: formatted.length } }
}

async function handleGetLeads(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId } = ctx
  const limit = Math.min((args.limit as number) || 10, 50)

  let query = supabaseAdmin
    .from('extracted_leads')
    .select('id, name, phone_number, email, status, region_notes, created_at, first_contact, last_text_date')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (args.status) {
    query = query.eq('status', args.status)
  }

  if (args.search) {
    const search = args.search as string
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone_number.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  const formatted = (data || []).map((l: any) => ({
    id: l.id,
    name: l.name || 'Unknown',
    phone: l.phone_number,
    email: l.email,
    status: l.status || 'No status',
    notes: l.region_notes,
    createdAt: l.created_at ? new Date(l.created_at).toLocaleDateString('en-AU') : null,
    firstContact: l.first_contact ? new Date(l.first_contact).toLocaleDateString('en-AU') : null,
    lastContact: l.last_text_date ? new Date(l.last_text_date).toLocaleDateString('en-AU') : null
  }))

  return { success: true, data: { leads: formatted, count: formatted.length } }
}

async function handleGetQuotes(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId } = ctx
  const limit = Math.min((args.limit as number) || 10, 50)

  let query = supabaseAdmin
    .from('quotes')
    .select(`
      id,
      quote_number,
      address,
      service,
      total_inc_gst,
      deposit_amount,
      customer_name,
      customer_email,
      accepted_at,
      created_at,
      lead:extracted_leads(id, name, phone_number, email)
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (args.quoteNumber) {
    query = query.eq('quote_number', args.quoteNumber)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  let results = data || []

  // Filter by customer name
  if (args.customerName) {
    const search = (args.customerName as string).toLowerCase()
    results = results.filter((q: any) =>
      q.customer_name?.toLowerCase().includes(search) ||
      q.lead?.name?.toLowerCase().includes(search)
    )
  }

  const formatted = results.map((q: any) => ({
    id: q.id,
    quoteNumber: q.quote_number || q.id.slice(0, 8),
    customer: q.customer_name || q.lead?.name || 'Unknown',
    customerEmail: q.customer_email || q.lead?.email,
    customerPhone: q.lead?.phone_number,
    service: q.service,
    address: q.address,
    total: q.total_inc_gst ? `$${q.total_inc_gst.toFixed(2)}` : 'N/A',
    deposit: q.deposit_amount ? `$${q.deposit_amount.toFixed(2)}` : 'N/A',
    accepted: q.accepted_at ? 'Yes' : 'No',
    createdAt: q.created_at ? new Date(q.created_at).toLocaleDateString('en-AU') : null
  }))

  return { success: true, data: { quotes: formatted, count: formatted.length } }
}

async function handleGetCleaners(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId } = ctx
  const activeOnly = args.activeOnly !== false

  let query = supabaseAdmin
    .from('cleaners')
    .select('id, full_name, phone, email, base_location_text, availability, active, has_transport, rates')
    .eq('org_id', orgId)
    .order('full_name')

  if (activeOnly) {
    query = query.eq('active', true)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  let results = data || []

  if (args.search) {
    const search = (args.search as string).toLowerCase()
    results = results.filter((c: any) => c.full_name?.toLowerCase().includes(search))
  }

  const formatted = results.map((c: any) => ({
    id: c.id,
    name: c.full_name,
    phone: c.phone,
    email: c.email,
    baseLocation: c.base_location_text,
    active: c.active,
    hasTransport: c.has_transport,
    availability: c.availability
  }))

  return { success: true, data: { cleaners: formatted, count: formatted.length } }
}

async function handleSearchCrm(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const query = args.query as string
  if (!query || query.length < 2) {
    return { success: false, error: 'Search query must be at least 2 characters' }
  }

  // Search leads
  const leadsResult = await handleGetLeads(ctx, { search: query, limit: 5 })

  // Search cleaners
  const cleanersResult = await handleGetCleaners(ctx, { search: query })

  // Search quotes
  const quotesResult = await handleGetQuotes(ctx, { customerName: query, limit: 5 })

  return {
    success: true,
    data: {
      leads: leadsResult.data?.leads || [],
      cleaners: cleanersResult.data?.cleaners || [],
      quotes: quotesResult.data?.quotes || []
    }
  }
}

// ---------------------------------------------------------------------------
// NEW Query Tool Handlers
// ---------------------------------------------------------------------------

async function handleGetPricingRules(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { org } = ctx
  const serviceFilter = args.service as ServiceType | undefined

  // Get org default rates or use system defaults
  const clientHourlyRate = (org.default_client_hourly_rate as number) || DEFAULT_PRICING.CLIENT_HOURLY_RATE
  const cleanerHourlyRate = (org.default_cleaner_hourly_rate as number) || DEFAULT_PRICING.CLEANER_HOURLY_RATE
  const gstRate = (org.gst_rate as number) || DEFAULT_PRICING.GST_RATE
  const defaultDiscountPct = (org.default_discount_pct as number) || DEFAULT_PRICING.DEFAULT_DISCOUNT_PCT
  const defaultDepositPct = (org.default_deposit_pct as number) || DEFAULT_PRICING.DEFAULT_DEPOSIT_PCT

  // Build service hours data
  const serviceHours: Record<string, unknown> = {}
  const services = serviceFilter ? [serviceFilter] : ['general', 'deep', 'move'] as ServiceType[]

  for (const service of services) {
    const combos: { bedrooms: number; bathrooms: number; hours: number }[] = []
    for (const [key, hours] of Object.entries(SERVICE_HOURS[service])) {
      const [bed, bath] = key.split(',').map(Number)
      combos.push({ bedrooms: bed, bathrooms: bath, hours })
    }
    serviceHours[service] = combos.sort((a, b) => a.bedrooms - b.bedrooms || a.bathrooms - b.bathrooms)
  }

  // Build add-ons list with display names
  const addons = Object.entries(STANDARD_ADD_ONS).map(([key, hours]) => ({
    key,
    name: ADDON_DISPLAY_NAMES[key] || key.replace(/_/g, ' '),
    hours,
    estimatedCost: `$${(hours * clientHourlyRate).toFixed(2)}`
  }))

  return {
    success: true,
    data: {
      defaultRates: {
        clientHourlyRate: `$${clientHourlyRate}/hr`,
        cleanerHourlyRate: `$${cleanerHourlyRate}/hr`,
        gstRate: `${(gstRate * 100).toFixed(0)}%`,
        defaultDiscountPct: `${defaultDiscountPct}%`,
        defaultDepositPct: `${defaultDepositPct}%`
      },
      serviceHours,
      addons,
      validBedBathCombos: 'Valid combinations: 1bed/1bath, 2bed/1bath, 2bed/2bath, 3bed/2bath, 4bed/2bath, 4bed/3bath, 5bed/3bath, 6bed/3bath'
    }
  }
}

async function handleGetOrgSettings(
  ctx: OrgContext,
  _args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { org } = ctx

  return {
    success: true,
    data: {
      businessName: org.business_name || org.name,
      businessPhone: org.business_phone,
      businessEmail: org.business_email,
      timezone: org.timezone || 'Australia/Sydney',
      currency: org.currency || 'AUD',
      defaultClientHourlyRate: org.default_client_hourly_rate || DEFAULT_PRICING.CLIENT_HOURLY_RATE,
      defaultCleanerHourlyRate: org.default_cleaner_hourly_rate || DEFAULT_PRICING.CLEANER_HOURLY_RATE,
      gstRate: org.gst_rate || DEFAULT_PRICING.GST_RATE,
      defaultDiscountPct: org.default_discount_pct || DEFAULT_PRICING.DEFAULT_DISCOUNT_PCT,
      defaultDepositPct: org.default_deposit_pct || DEFAULT_PRICING.DEFAULT_DEPOSIT_PCT,
      bankAccountName: org.bank_account_name,
      bankBsb: org.bank_bsb,
      bankAccountNumber: org.bank_account_number ? '****' + String(org.bank_account_number).slice(-4) : null
    }
  }
}

async function handleGetCommunicationsLog(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId, org } = ctx
  const timezone = (org.timezone as string) || 'Australia/Sydney'
  const limit = Math.min((args.limit as number) || 20, 50)
  const type = (args.type as string) || 'all'

  // Find the lead
  let leadId = args.leadId as string | undefined
  let phoneNumber: string | undefined

  if (!leadId && args.customerName) {
    const { data: leads } = await supabaseAdmin
      .from('extracted_leads')
      .select('id, phone_number')
      .eq('org_id', orgId)
      .ilike('name', `%${args.customerName}%`)
      .limit(1)

    if (leads?.length) {
      leadId = leads[0].id
      phoneNumber = leads[0].phone_number
    }
  }

  if (!leadId && !phoneNumber) {
    return { success: false, error: 'Could not find customer' }
  }

  const results: any[] = []

  // Get SMS messages
  if (type === 'all' || type === 'sms') {
    if (phoneNumber) {
      const { data: sms } = await supabaseAdmin
        .from('dialpad_sms')
        .select('id, direction, content, created_at, external_number')
        .eq('org_id', orgId)
        .eq('external_number', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (sms) {
        results.push(...sms.map((s: any) => ({
          type: 'sms',
          direction: s.direction,
          content: s.content,
          date: new Date(s.created_at).toLocaleString('en-AU', { timeZone: timezone }),
          timestamp: s.created_at
        })))
      }
    }
  }

  // Get calls
  if (type === 'all' || type === 'call') {
    if (phoneNumber) {
      const { data: calls } = await supabaseAdmin
        .from('dialpad_calls')
        .select('id, direction, duration, created_at, external_number')
        .eq('org_id', orgId)
        .eq('external_number', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (calls) {
        results.push(...calls.map((c: any) => ({
          type: 'call',
          direction: c.direction,
          duration: c.duration ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : 'Unknown',
          date: new Date(c.created_at).toLocaleString('en-AU', { timeZone: timezone }),
          timestamp: c.created_at
        })))
      }
    }
  }

  // Sort by timestamp descending
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return {
    success: true,
    data: {
      communications: results.slice(0, limit),
      count: results.length
    }
  }
}

async function handleGetMarketingStatus(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId, org } = ctx
  const timezone = (org.timezone as string) || 'Australia/Sydney'

  // Find the lead
  let leadId = args.leadId as string | undefined

  if (!leadId && args.customerName) {
    const { data: leads } = await supabaseAdmin
      .from('extracted_leads')
      .select('id, name')
      .eq('org_id', orgId)
      .ilike('name', `%${args.customerName}%`)
      .limit(1)

    if (leads?.length) {
      leadId = leads[0].id
    }
  }

  if (!leadId) {
    return { success: false, error: 'Could not find customer' }
  }

  // Get SMS journey status
  const { data: smsJourney } = await supabaseAdmin
    .from('marketing_sms_journeys')
    .select('status, current_step, next_send_at, started_at, completed_at')
    .eq('lead_id', leadId)
    .maybeSingle()

  // Get email journey status
  const { data: emailJourney } = await supabaseAdmin
    .from('marketing_email_journeys')
    .select('status, current_step, next_send_at, started_at, completed_at')
    .eq('lead_id', leadId)
    .maybeSingle()

  const formatJourney = (journey: any, type: string) => {
    if (!journey) return { status: 'not_started', message: `No ${type} marketing journey` }
    return {
      status: journey.status,
      currentStep: journey.current_step,
      nextSendAt: journey.next_send_at
        ? new Date(journey.next_send_at).toLocaleString('en-AU', { timeZone: timezone })
        : null,
      startedAt: journey.started_at
        ? new Date(journey.started_at).toLocaleString('en-AU', { timeZone: timezone })
        : null,
      completedAt: journey.completed_at
        ? new Date(journey.completed_at).toLocaleString('en-AU', { timeZone: timezone })
        : null
    }
  }

  return {
    success: true,
    data: {
      smsJourney: formatJourney(smsJourney, 'SMS'),
      emailJourney: formatJourney(emailJourney, 'email')
    }
  }
}

async function handleGetCleanerSchedule(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId, org } = ctx
  const timezone = (org.timezone as string) || 'Australia/Sydney'

  // Find the cleaner
  let cleanerId = args.cleanerId as string | undefined

  if (!cleanerId && args.cleanerName) {
    const { data: cleaners } = await supabaseAdmin
      .from('cleaners')
      .select('id, full_name')
      .eq('org_id', orgId)
      .eq('active', true)
      .ilike('full_name', `%${args.cleanerName}%`)
      .limit(1)

    if (cleaners?.length) {
      cleanerId = cleaners[0].id
    }
  }

  if (!cleanerId) {
    return { success: false, error: 'Could not find cleaner' }
  }

  // Parse dates
  const today = new Date()
  const startDateStr = (args.startDate as string) || today.toISOString().split('T')[0]
  const startDate = new Date(startDateStr + 'T00:00:00')

  let endDate: Date
  if (args.endDate) {
    endDate = new Date((args.endDate as string) + 'T23:59:59')
  } else {
    endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 7)
  }

  // Get bookings for this cleaner
  const { data: bookings, error } = await supabaseAdmin
    .from('booking_occurrences')
    .select(`
      id, start_at, end_at, status,
      series:booking_series(title, service_address, lead:extracted_leads(name, phone_number))
    `)
    .eq('org_id', orgId)
    .eq('cleaner_id', cleanerId)
    .gte('start_at', startDate.toISOString())
    .lte('start_at', endDate.toISOString())
    .order('start_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  // Get cleaner info
  const { data: cleaner } = await supabaseAdmin
    .from('cleaners')
    .select('full_name, phone, availability')
    .eq('id', cleanerId)
    .single()

  const formatted = (bookings || []).map((b: any) => ({
    date: new Date(b.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
    time: new Date(b.start_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }),
    endTime: new Date(b.end_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }),
    status: b.status,
    customer: b.series?.lead?.name || 'Unknown',
    customerPhone: b.series?.lead?.phone_number || null,
    address: b.series?.service_address || 'N/A',
    title: b.series?.title || 'Cleaning'
  }))

  return {
    success: true,
    data: {
      cleaner: cleaner?.full_name || 'Unknown',
      cleanerPhone: cleaner?.phone || null,
      availability: cleaner?.availability || null,
      period: `${startDate.toLocaleDateString('en-AU')} to ${endDate.toLocaleDateString('en-AU')}`,
      bookings: formatted,
      totalJobs: formatted.length
    }
  }
}

async function handleGetAnalytics(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId } = ctx
  const metric = (args.metric as string) || 'summary'
  const period = (args.period as string) || 'this_month'

  // Calculate date range
  const now = new Date()
  let startDate: Date
  let endDate: Date = now

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'this_week':
      startDate = new Date(now)
      startDate.setDate(now.getDate() - now.getDay())
      startDate.setHours(0, 0, 0, 0)
      break
    case 'last_week':
      startDate = new Date(now)
      startDate.setDate(now.getDate() - now.getDay() - 7)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)
      endDate.setHours(23, 59, 59, 999)
      break
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      break
    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const result: Record<string, unknown> = { period }

  // Revenue metrics
  if (metric === 'revenue' || metric === 'summary') {
    const { data: completedBookings } = await supabaseAdmin
      .from('booking_occurrences')
      .select('id, series:booking_series(quote:quotes(total_inc_gst, cleaner_pay))')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .gte('start_at', startDate.toISOString())
      .lte('start_at', endDate.toISOString())

    let totalRevenue = 0
    let totalCleanerPay = 0
    (completedBookings || []).forEach((b: any) => {
      if (b.series?.quote?.total_inc_gst) {
        totalRevenue += b.series.quote.total_inc_gst
      }
      if (b.series?.quote?.cleaner_pay) {
        totalCleanerPay += b.series.quote.cleaner_pay
      }
    })

    result.revenue = {
      total: `$${totalRevenue.toFixed(2)}`,
      cleanerPay: `$${totalCleanerPay.toFixed(2)}`,
      profit: `$${(totalRevenue - totalCleanerPay).toFixed(2)}`,
      margin: totalRevenue > 0 ? `${((totalRevenue - totalCleanerPay) / totalRevenue * 100).toFixed(1)}%` : '0%'
    }
  }

  // Job metrics
  if (metric === 'jobs' || metric === 'summary') {
    const { data: allBookings } = await supabaseAdmin
      .from('booking_occurrences')
      .select('status')
      .eq('org_id', orgId)
      .gte('start_at', startDate.toISOString())
      .lte('start_at', endDate.toISOString())

    const counts = { completed: 0, scheduled: 0, cancelled: 0, skipped: 0 }
    ;(allBookings || []).forEach((b: any) => {
      if (counts[b.status as keyof typeof counts] !== undefined) {
        counts[b.status as keyof typeof counts]++
      }
    })

    result.jobs = {
      total: allBookings?.length || 0,
      completed: counts.completed,
      scheduled: counts.scheduled,
      cancelled: counts.cancelled,
      skipped: counts.skipped
    }
  }

  // Lead metrics
  if (metric === 'leads' || metric === 'summary') {
    const { data: leads } = await supabaseAdmin
      .from('extracted_leads')
      .select('status')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    const statusCounts: Record<string, number> = {}
    ;(leads || []).forEach((l: any) => {
      const status = l.status || 'Unknown'
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })

    result.leads = {
      total: leads?.length || 0,
      byStatus: statusCounts
    }
  }

  // Conversion metrics
  if (metric === 'conversion' || metric === 'summary') {
    const { count: totalLeads } = await supabaseAdmin
      .from('extracted_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    const { count: bookedLeads } = await supabaseAdmin
      .from('extracted_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'Booking Confirmed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    const conversionRate = (totalLeads || 0) > 0
      ? ((bookedLeads || 0) / (totalLeads || 1) * 100).toFixed(1)
      : '0'

    result.conversion = {
      totalLeads: totalLeads || 0,
      converted: bookedLeads || 0,
      rate: `${conversionRate}%`
    }
  }

  return { success: true, data: result }
}

// ---------------------------------------------------------------------------
// Action Tool Handlers (for generating previews)
// ---------------------------------------------------------------------------

async function generateActionPreview(
  ctx: OrgContext,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ preview: Record<string, unknown>; error?: string }> {
  const { supabaseAdmin, orgId } = ctx

  switch (toolName) {
    case 'send_quote_email': {
      // Find the quote
      let quoteQuery = supabaseAdmin
        .from('quotes')
        .select('id, quote_number, customer_name, customer_email, total_inc_gst, address, lead:extracted_leads(name, email)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (args.quoteId) {
        quoteQuery = quoteQuery.eq('id', args.quoteId)
      } else if (args.customerName) {
        const search = (args.customerName as string).toLowerCase()
        // We'll fetch and filter
      }

      const { data: quotes } = await quoteQuery

      if (!quotes || quotes.length === 0) {
        return { preview: {}, error: 'No quote found for this customer' }
      }

      let quote = quotes[0]
      if (args.customerName && !args.quoteId) {
        const search = (args.customerName as string).toLowerCase()
        quote = quotes.find((q: any) =>
          q.customer_name?.toLowerCase().includes(search) ||
          q.lead?.name?.toLowerCase().includes(search)
        ) || quote
      }

      const recipientEmail = (args.emailOverride as string) || quote.customer_email || quote.lead?.email

      return {
        preview: {
          action: 'Send quote via email',
          quoteNumber: quote.quote_number || quote.id.slice(0, 8),
          customer: quote.customer_name || quote.lead?.name || 'Unknown',
          recipient: recipientEmail || 'No email on file',
          total: quote.total_inc_gst ? `$${quote.total_inc_gst.toFixed(2)}` : 'N/A',
          address: quote.address || 'N/A',
          _quoteId: quote.id,
          _email: recipientEmail
        }
      }
    }

    case 'send_sms': {
      let phone = args.phoneNumber as string
      let customerName = args.customerName as string

      if (!phone && customerName) {
        // Look up phone from lead
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name, phone_number')
          .eq('org_id', orgId)
          .ilike('name', `%${customerName}%`)
          .limit(1)

        if (leads && leads.length > 0) {
          phone = leads[0].phone_number
          customerName = leads[0].name
        }
      }

      if (!phone) {
        return { preview: {}, error: 'Could not find phone number for this customer' }
      }

      return {
        preview: {
          action: 'Send SMS',
          recipient: customerName || 'Customer',
          phone: phone,
          message: args.message as string,
          _phone: phone
        }
      }
    }

    case 'assign_cleaner': {
      // Find the booking - search both assigned and unassigned bookings
      // This allows reassigning cleaners to already-assigned jobs
      let bookingQuery = supabaseAdmin
        .from('booking_occurrences')
        .select(`
          id, start_at, status, cleaner_id,
          series:booking_series(title, service_address, lead:extracted_leads(name)),
          current_cleaner:cleaners(full_name)
        `)
        .eq('org_id', orgId)
        .eq('status', 'scheduled')
        .order('start_at', { ascending: true })
        .limit(20)

      // If a specific date is provided, filter by it
      if (args.jobDate) {
        const dateSearch = args.jobDate as string
        bookingQuery = bookingQuery.gte('start_at', dateSearch + 'T00:00:00').lte('start_at', dateSearch + 'T23:59:59')
      }

      const { data: bookings } = await bookingQuery

      if (!bookings || bookings.length === 0) {
        return { preview: {}, error: 'No scheduled bookings found' }
      }

      // Find matching booking by customer name if provided
      let booking = bookings[0]
      if (args.customerName) {
        const search = (args.customerName as string).toLowerCase()
        const match = bookings.find((b: any) =>
          b.series?.lead?.name?.toLowerCase().includes(search)
        )
        if (match) {
          booking = match
        } else {
          return { preview: {}, error: `No booking found for customer "${args.customerName}"` }
        }
      }

      // Find the cleaner to assign
      const { data: cleaners } = await supabaseAdmin
        .from('cleaners')
        .select('id, full_name')
        .eq('org_id', orgId)
        .eq('active', true)
        .ilike('full_name', `%${args.cleanerName}%`)
        .limit(1)

      if (!cleaners || cleaners.length === 0) {
        return { preview: {}, error: `Could not find cleaner "${args.cleanerName}"` }
      }

      const cleaner = cleaners[0]
      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'
      const currentCleaner = (booking as any).current_cleaner?.full_name || null
      const isReassignment = currentCleaner && currentCleaner !== cleaner.full_name

      return {
        preview: {
          action: isReassignment ? 'Reassign cleaner' : 'Assign cleaner to booking',
          customer: (booking as any).series?.lead?.name || 'Unknown',
          jobTitle: (booking as any).series?.title || 'Cleaning',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          jobTime: new Date(booking.start_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }),
          address: (booking as any).series?.service_address || 'N/A',
          ...(isReassignment ? { previousCleaner: currentCleaner } : {}),
          cleaner: cleaner.full_name,
          _occurrenceId: booking.id,
          _cleanerId: cleaner.id
        }
      }
    }

    case 'update_booking_status': {
      // Find the booking
      const { data: bookings } = await supabaseAdmin
        .from('booking_occurrences')
        .select(`
          id, start_at, status,
          series:booking_series(title, service_address, lead:extracted_leads(name)),
          cleaner:cleaners(full_name)
        `)
        .eq('org_id', orgId)
        .order('start_at', { ascending: false })
        .limit(10)

      if (!bookings || bookings.length === 0) {
        return { preview: {}, error: 'No bookings found' }
      }

      let booking = bookings[0]
      if (args.customerName) {
        const search = (args.customerName as string).toLowerCase()
        booking = bookings.find((b: any) =>
          b.series?.lead?.name?.toLowerCase().includes(search)
        ) || booking
      }
      if (args.jobDate) {
        const dateSearch = args.jobDate as string
        booking = bookings.find((b: any) =>
          b.start_at.startsWith(dateSearch)
        ) || booking
      }
      if (args.occurrenceId) {
        booking = bookings.find((b: any) => b.id === args.occurrenceId) || booking
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'

      return {
        preview: {
          action: 'Update booking status',
          customer: booking.series?.lead?.name || 'Unknown',
          jobTitle: booking.series?.title || 'Cleaning',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          currentStatus: booking.status,
          newStatus: args.newStatus,
          cleaner: booking.cleaner?.full_name || 'Unassigned',
          _occurrenceId: booking.id
        }
      }
    }

    case 'update_lead_status': {
      // Find the lead
      let leadQuery = supabaseAdmin
        .from('extracted_leads')
        .select('id, name, status, phone_number, email')
        .eq('org_id', orgId)
        .limit(1)

      if (args.leadId) {
        leadQuery = leadQuery.eq('id', args.leadId)
      } else if (args.customerName) {
        leadQuery = leadQuery.ilike('name', `%${args.customerName}%`)
      }

      const { data: leads } = await leadQuery

      if (!leads || leads.length === 0) {
        return { preview: {}, error: 'Lead not found' }
      }

      const lead = leads[0]

      return {
        preview: {
          action: 'Update lead status',
          customer: lead.name || 'Unknown',
          phone: lead.phone_number,
          email: lead.email,
          currentStatus: lead.status || 'No status',
          newStatus: args.newStatus,
          _leadId: lead.id
        }
      }
    }

    // === NEW ACTION PREVIEWS ===

    case 'create_lead': {
      const name = args.name as string
      if (!name) {
        return { preview: {}, error: 'Customer name is required' }
      }

      return {
        preview: {
          action: 'Create new lead',
          name: name,
          phone: args.phone || 'Not provided',
          email: args.email || 'Not provided',
          notes: args.notes || 'None',
          status: args.status || 'Inquiry'
        }
      }
    }

    case 'create_quote': {
      const service = args.service as ServiceType
      const bedrooms = args.bedrooms as number
      const bathrooms = args.bathrooms as number

      if (!service || !bedrooms || !bathrooms) {
        return { preview: {}, error: 'Service type, bedrooms, and bathrooms are required' }
      }

      // Find the lead
      let leadId = args.leadId as string | undefined
      let leadName = 'New customer'
      let leadEmail = args.customerEmail as string | undefined
      let leadPhone = args.customerPhone as string | undefined

      if (args.customerName && !leadId) {
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name, email, phone_number')
          .eq('org_id', orgId)
          .ilike('name', `%${args.customerName}%`)
          .limit(1)

        if (leads?.length) {
          leadId = leads[0].id
          leadName = leads[0].name
          leadEmail = leadEmail || leads[0].email
          leadPhone = leadPhone || leads[0].phone_number
        }
      }

      // Calculate quote
      const clientRate = (ctx.org.default_client_hourly_rate as number) || DEFAULT_PRICING.CLIENT_HOURLY_RATE
      const cleanerRate = (ctx.org.default_cleaner_hourly_rate as number) || DEFAULT_PRICING.CLEANER_HOURLY_RATE
      const discountPct = (args.discountPercentage as number) ?? (ctx.org.default_discount_pct as number) ?? DEFAULT_PRICING.DEFAULT_DISCOUNT_PCT
      const depositPct = (args.depositPercentage as number) ?? (ctx.org.default_deposit_pct as number) ?? DEFAULT_PRICING.DEFAULT_DEPOSIT_PCT

      try {
        const quoteInput: QuoteInput = {
          service,
          bedrooms,
          bathrooms,
          addons: (args.addons as string[]) || [],
          customAddons: (args.customAddons as { name: string; price: number }[]) || [],
          clientHourlyRate: clientRate,
          cleanerHourlyRate: cleanerRate,
          cleanerRateType: 'hour',
          discountApplied: discountPct > 0,
          discountPercentage: discountPct,
          depositPercentage: depositPct
        }

        const quote = calculateQuote(quoteInput)

        return {
          preview: {
            action: 'Create quote',
            customer: leadName,
            address: args.address || 'Not specified',
            service: service === 'general' ? 'General Clean' : service === 'deep' ? 'Deep Clean' : 'Move In/Out Clean',
            bedrooms,
            bathrooms,
            addons: (args.addons as string[])?.length ? (args.addons as string[]).map(a => ADDON_DISPLAY_NAMES[a] || a).join(', ') : 'None',
            hours: `${quote.totalLaborHours} hours`,
            subtotal: `$${quote.subtotal.toFixed(2)}`,
            discount: discountPct > 0 ? `${discountPct}% ($${quote.discountAmount.toFixed(2)})` : 'None',
            gst: `$${quote.gst.toFixed(2)}`,
            total: `$${quote.totalIncGst.toFixed(2)}`,
            deposit: depositPct > 0 ? `${depositPct}% ($${quote.depositAmount.toFixed(2)})` : 'None',
            _leadId: leadId,
            _leadName: leadName,
            _leadEmail: leadEmail,
            _leadPhone: leadPhone,
            _quoteResult: quote
          }
        }
      } catch (err) {
        return { preview: {}, error: err instanceof Error ? err.message : 'Invalid quote parameters' }
      }
    }

    case 'create_booking': {
      const startDateTime = args.startDateTime as string
      if (!startDateTime) {
        return { preview: {}, error: 'Start date/time is required' }
      }

      // Find quote
      let quoteId = args.quoteId as string | undefined
      let leadId: string | undefined
      let customerName = 'Unknown'
      let address = 'Unknown'

      if (args.customerName && !quoteId) {
        const { data: quotes } = await supabaseAdmin
          .from('quotes')
          .select('id, customer_name, address, total_inc_gst, lead_id, lead:extracted_leads(name)')
          .eq('org_id', orgId)
          .or(`customer_name.ilike.%${args.customerName}%`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (quotes?.length) {
          quoteId = quotes[0].id
          leadId = quotes[0].lead_id
          customerName = quotes[0].customer_name || (quotes[0].lead as any)?.name || 'Unknown'
          address = quotes[0].address || 'Unknown'
        }
      }

      if (!quoteId) {
        return { preview: {}, error: 'Could not find a quote for this customer. Create a quote first.' }
      }

      const startDate = new Date(startDateTime)
      const repeatType = (args.repeatType as string) || 'none'
      const durationMinutes = (args.durationMinutes as number) || 120

      return {
        preview: {
          action: 'Create booking',
          customer: customerName,
          address,
          startDate: startDate.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          startTime: startDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
          duration: `${durationMinutes} minutes`,
          recurrence: repeatType === 'none' ? 'One-off' : repeatType.charAt(0).toUpperCase() + repeatType.slice(1),
          untilDate: args.untilDate || (args.occurrenceCount ? `${args.occurrenceCount} occurrences` : 'Ongoing'),
          _quoteId: quoteId,
          _leadId: leadId
        }
      }
    }

    case 'initiate_call': {
      let phone = args.phoneNumber as string
      let customerName = args.customerName as string || 'Unknown'

      if (!phone && customerName) {
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name, phone_number')
          .eq('org_id', orgId)
          .ilike('name', `%${customerName}%`)
          .limit(1)

        if (leads?.length) {
          phone = leads[0].phone_number
          customerName = leads[0].name
        }
      }

      if (!phone) {
        return { preview: {}, error: 'Could not find phone number for this customer' }
      }

      return {
        preview: {
          action: 'Initiate phone call',
          customer: customerName,
          phone,
          _phone: phone
        }
      }
    }

    case 'create_payment_link': {
      let quoteId = args.quoteId as string | undefined
      let amountDollars = args.amountDollars as number | undefined
      let customerName = 'Unknown'
      let customerEmail: string | undefined

      if (args.customerName && !quoteId) {
        const { data: quotes } = await supabaseAdmin
          .from('quotes')
          .select('id, customer_name, customer_email, total_inc_gst, lead:extracted_leads(name, email)')
          .eq('org_id', orgId)
          .or(`customer_name.ilike.%${args.customerName}%`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (quotes?.length) {
          quoteId = quotes[0].id
          customerName = quotes[0].customer_name || (quotes[0].lead as any)?.name || 'Unknown'
          customerEmail = quotes[0].customer_email || (quotes[0].lead as any)?.email
          if (!amountDollars) {
            amountDollars = quotes[0].total_inc_gst
          }
        }
      }

      if (!amountDollars) {
        return { preview: {}, error: 'Amount is required (or specify a customer with a quote)' }
      }

      return {
        preview: {
          action: 'Create payment link',
          customer: customerName,
          amount: `$${amountDollars.toFixed(2)} AUD`,
          description: args.description || 'Payment for cleaning services',
          _quoteId: quoteId,
          _amountCents: Math.round(amountDollars * 100),
          _customerEmail: customerEmail
        }
      }
    }

    case 'start_marketing_loop': {
      let leadId = args.leadId as string | undefined
      let customerName = 'Unknown'
      let phone: string | undefined
      let email: string | undefined

      if (args.customerName && !leadId) {
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name, phone_number, email')
          .eq('org_id', orgId)
          .ilike('name', `%${args.customerName}%`)
          .limit(1)

        if (leads?.length) {
          leadId = leads[0].id
          customerName = leads[0].name
          phone = leads[0].phone_number
          email = leads[0].email
        }
      }

      if (!leadId) {
        return { preview: {}, error: 'Could not find customer' }
      }

      const journeyType = (args.journeyType as string) || 'both'

      return {
        preview: {
          action: 'Start marketing automation',
          customer: customerName,
          journeyType: journeyType === 'both' ? 'SMS + Email' : journeyType.toUpperCase(),
          phone: journeyType !== 'email' ? (phone || 'No phone') : 'N/A',
          email: journeyType !== 'sms' ? (email || 'No email') : 'N/A',
          _leadId: leadId,
          _journeyType: journeyType
        }
      }
    }

    case 'pause_marketing_loop':
    case 'cancel_marketing_loop': {
      let leadId = args.leadId as string | undefined
      let customerName = 'Unknown'

      if (args.customerName && !leadId) {
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name')
          .eq('org_id', orgId)
          .ilike('name', `%${args.customerName}%`)
          .limit(1)

        if (leads?.length) {
          leadId = leads[0].id
          customerName = leads[0].name
        }
      }

      if (!leadId) {
        return { preview: {}, error: 'Could not find customer' }
      }

      const journeyType = (args.journeyType as string) || 'both'
      const action = toolName === 'pause_marketing_loop' ? 'Pause' : 'Cancel'

      return {
        preview: {
          action: `${action} marketing automation`,
          customer: customerName,
          journeyType: journeyType === 'both' ? 'SMS + Email' : journeyType.toUpperCase(),
          _leadId: leadId,
          _journeyType: journeyType,
          _action: toolName === 'pause_marketing_loop' ? 'pause' : 'cancel'
        }
      }
    }

    case 'reschedule_booking': {
      const newDateTime = args.newDateTime as string
      if (!newDateTime) {
        return { preview: {}, error: 'New date/time is required' }
      }

      let occurrenceId = args.occurrenceId as string | undefined
      let customerName = 'Unknown'
      let currentDate = 'Unknown'

      if (args.customerName && !occurrenceId) {
        const { data: bookings } = await supabaseAdmin
          .from('booking_occurrences')
          .select('id, start_at, series:booking_series(lead:extracted_leads(name))')
          .eq('org_id', orgId)
          .eq('status', 'scheduled')
          .order('start_at', { ascending: true })
          .limit(10)

        if (bookings?.length) {
          const search = (args.customerName as string).toLowerCase()
          const booking = bookings.find((b: any) =>
            b.series?.lead?.name?.toLowerCase().includes(search)
          ) || bookings[0]

          occurrenceId = booking.id
          customerName = booking.series?.lead?.name || 'Unknown'
          currentDate = new Date(booking.start_at).toLocaleString('en-AU')
        }
      }

      if (!occurrenceId) {
        return { preview: {}, error: 'Could not find booking to reschedule' }
      }

      const newDate = new Date(newDateTime)

      return {
        preview: {
          action: 'Reschedule booking',
          customer: customerName,
          currentDateTime: currentDate,
          newDate: newDate.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          newTime: newDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
          _occurrenceId: occurrenceId,
          _newDateTime: newDateTime
        }
      }
    }

    case 'cancel_booking_series': {
      let seriesId = args.seriesId as string | undefined
      let customerName = 'Unknown'
      let futureCount = 0

      if (args.customerName && !seriesId) {
        const { data: series } = await supabaseAdmin
          .from('booking_series')
          .select('id, lead:extracted_leads(name)')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .limit(10)

        if (series?.length) {
          const search = (args.customerName as string).toLowerCase()
          const match = series.find((s: any) =>
            s.lead?.name?.toLowerCase().includes(search)
          )

          if (match) {
            seriesId = match.id
            customerName = match.lead?.name || 'Unknown'
          }
        }
      }

      if (!seriesId) {
        return { preview: {}, error: 'Could not find booking series' }
      }

      // Count future occurrences
      const { count } = await supabaseAdmin
        .from('booking_occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId)
        .eq('status', 'scheduled')
        .gte('start_at', new Date().toISOString())

      futureCount = count || 0

      return {
        preview: {
          action: 'Cancel booking series',
          customer: customerName,
          futureBookingsToCancel: futureCount,
          _seriesId: seriesId
        }
      }
    }

    // === NEW PREVIEW HANDLERS ===

    case 'update_lead': {
      // Find the lead
      let leadId = args.leadId as string | undefined
      let lead: any = null

      if (leadId) {
        const { data } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name, phone_number, email, region_notes, address')
          .eq('id', leadId)
          .eq('org_id', orgId)
          .single()
        lead = data
      } else if (args.customerName) {
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('id, name, phone_number, email, region_notes, address')
          .eq('org_id', orgId)
          .ilike('name', `%${args.customerName}%`)
          .limit(1)

        if (leads?.length) {
          lead = leads[0]
          leadId = lead.id
        }
      }

      if (!lead) {
        return { preview: {}, error: 'Could not find customer' }
      }

      const changes: string[] = []
      if (args.newPhone) changes.push(`Phone: ${lead.phone_number || 'none'} â†’ ${args.newPhone}`)
      if (args.newEmail) changes.push(`Email: ${lead.email || 'none'} â†’ ${args.newEmail}`)
      if (args.newAddress) changes.push(`Address: ${lead.address || 'none'} â†’ ${args.newAddress}`)
      if (args.newNotes) changes.push(`Notes: will be replaced`)
      if (args.appendNotes) changes.push(`Notes: will append "${args.appendNotes}"`)

      if (changes.length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Update customer information',
          customer: lead.name,
          changes: changes.join('; '),
          _leadId: leadId,
          _newPhone: args.newPhone,
          _newEmail: args.newEmail,
          _newAddress: args.newAddress,
          _newNotes: args.newNotes,
          _appendNotes: args.appendNotes,
          _currentNotes: lead.region_notes
        }
      }
    }

    case 'edit_quote': {
      // Find the quote
      let quoteId = args.quoteId as string | undefined
      let quote: any = null

      if (quoteId) {
        const { data } = await supabaseAdmin
          .from('quotes')
          .select('id, quote_number, customer_name, addons, discount_percentage, address, notes, total_inc_gst, lead:extracted_leads(name)')
          .eq('id', quoteId)
          .eq('org_id', orgId)
          .single()
        quote = data
      } else if (args.customerName) {
        const { data: quotes } = await supabaseAdmin
          .from('quotes')
          .select('id, quote_number, customer_name, addons, discount_percentage, address, notes, total_inc_gst, lead:extracted_leads(name)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(10)

        if (quotes?.length) {
          const search = (args.customerName as string).toLowerCase()
          quote = quotes.find((q: any) =>
            q.customer_name?.toLowerCase().includes(search) ||
            q.lead?.name?.toLowerCase().includes(search)
          ) || quotes[0]
          quoteId = quote.id
        }
      }

      if (!quote) {
        return { preview: {}, error: 'Could not find quote' }
      }

      const changes: string[] = []
      const currentAddons = quote.addons || []
      let newAddons = [...currentAddons]

      if (args.addAddons) {
        const toAdd = args.addAddons as string[]
        newAddons = [...new Set([...newAddons, ...toAdd])]
        changes.push(`Add: ${toAdd.join(', ')}`)
      }
      if (args.removeAddons) {
        const toRemove = args.removeAddons as string[]
        newAddons = newAddons.filter(a => !toRemove.includes(a))
        changes.push(`Remove: ${toRemove.join(', ')}`)
      }
      if (args.newDiscountPercentage !== undefined) {
        changes.push(`Discount: ${quote.discount_percentage || 0}% â†’ ${args.newDiscountPercentage}%`)
      }
      if (args.newAddress) {
        changes.push(`Address: ${quote.address || 'none'} â†’ ${args.newAddress}`)
      }
      if (args.newNotes) {
        changes.push(`Notes updated`)
      }

      if (changes.length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Edit quote',
          quoteNumber: quote.quote_number || quote.id.slice(0, 8),
          customer: quote.customer_name || quote.lead?.name || 'Unknown',
          currentTotal: `$${quote.total_inc_gst?.toFixed(2) || 'N/A'}`,
          changes: changes.join('; '),
          _quoteId: quoteId,
          _newAddons: newAddons,
          _newDiscountPercentage: args.newDiscountPercentage,
          _newAddress: args.newAddress,
          _newNotes: args.newNotes
        }
      }
    }

    case 'mark_booking_paid': {
      // Find the booking
      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`
            id, start_at, payment_status,
            series:booking_series(title, quote:quotes(total_inc_gst), lead:extracted_leads(name))
          `)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`
            id, start_at, payment_status,
            series:booking_series(title, quote:quotes(total_inc_gst), lead:extracted_leads(name))
          `)
          .eq('org_id', orgId)
          .eq('status', 'completed')
          .neq('payment_status', 'paid')
          .order('start_at', { ascending: false })
          .limit(10)

        if (args.jobDate) {
          query = query.gte('start_at', args.jobDate + 'T00:00:00').lte('start_at', args.jobDate + 'T23:59:59')
        }

        const { data: bookings } = await query

        if (bookings?.length) {
          if (args.customerName) {
            const search = (args.customerName as string).toLowerCase()
            booking = bookings.find((b: any) =>
              b.series?.lead?.name?.toLowerCase().includes(search)
            )
          }
          if (!booking) booking = bookings[0]
          occurrenceId = booking?.id
        }
      }

      if (!booking) {
        return { preview: {}, error: 'Could not find unpaid completed booking' }
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'
      const amount = (args.amount as number) || booking.series?.quote?.total_inc_gst
      const paymentMethod = (args.paymentMethod as string) || 'cash'

      return {
        preview: {
          action: 'Record payment',
          customer: booking.series?.lead?.name || 'Unknown',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          amount: amount ? `$${amount.toFixed(2)}` : 'N/A',
          paymentMethod: paymentMethod,
          _occurrenceId: occurrenceId,
          _amount: amount,
          _paymentMethod: paymentMethod
        }
      }
    }

    case 'update_booking': {
      // Find the booking
      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`
            id, start_at, notes,
            series:booking_series(id, title, notes, lead:extracted_leads(name))
          `)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`
            id, start_at, notes,
            series:booking_series(id, title, notes, lead:extracted_leads(name))
          `)
          .eq('org_id', orgId)
          .eq('status', 'scheduled')
          .order('start_at', { ascending: true })
          .limit(10)

        if (args.jobDate) {
          query = query.gte('start_at', args.jobDate + 'T00:00:00').lte('start_at', args.jobDate + 'T23:59:59')
        }

        const { data: bookings } = await query

        if (bookings?.length) {
          if (args.customerName) {
            const search = (args.customerName as string).toLowerCase()
            booking = bookings.find((b: any) =>
              b.series?.lead?.name?.toLowerCase().includes(search)
            )
          }
          if (!booking) booking = bookings[0]
          occurrenceId = booking?.id
        }
      }

      if (!booking) {
        return { preview: {}, error: 'Could not find booking' }
      }

      const changes: string[] = []
      if (args.newNotes) changes.push('Notes will be replaced')
      if (args.appendNotes) changes.push(`Will append: "${args.appendNotes}"`)

      if (changes.length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'

      return {
        preview: {
          action: 'Update booking',
          customer: booking.series?.lead?.name || 'Unknown',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          jobTitle: booking.series?.title || 'Cleaning',
          changes: changes.join('; '),
          _occurrenceId: occurrenceId,
          _seriesId: booking.series?.id,
          _newNotes: args.newNotes,
          _appendNotes: args.appendNotes,
          _currentNotes: booking.notes || booking.series?.notes
        }
      }
    }

    default:
      return { preview: {}, error: `Unknown action: ${toolName}` }
  }
}

// ---------------------------------------------------------------------------
// Action Executors
// ---------------------------------------------------------------------------

async function executeAction(
  ctx: OrgContext,
  toolName: string,
  args: Record<string, unknown>,
  preview: Record<string, unknown>
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { supabaseAdmin, orgId } = ctx

  switch (toolName) {
    case 'send_quote_email': {
      const quoteId = preview._quoteId as string
      const email = preview._email as string

      if (!quoteId || !email) {
        return { success: false, error: 'Missing quote ID or email' }
      }

      // Call the quote-email edge function
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      const response = await fetch(`${supabaseUrl}/functions/v1/quote-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ quoteId, emailOverride: email })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to send quote: ${errorText}` }
      }

      return { success: true, message: `Quote sent successfully to ${email}` }
    }

    case 'send_sms': {
      const phone = preview._phone as string
      const message = args.message as string

      if (!phone || !message) {
        return { success: false, error: 'Missing phone number or message' }
      }

      // Call the dialpad-send-sms edge function
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ phone_number: phone, message })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to send SMS: ${errorText}` }
      }

      return { success: true, message: `SMS sent successfully to ${phone}` }
    }

    case 'assign_cleaner': {
      const occurrenceId = preview._occurrenceId as string
      const cleanerId = preview._cleanerId as string

      if (!occurrenceId || !cleanerId) {
        return { success: false, error: 'Missing booking or cleaner ID' }
      }

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({ cleaner_id: cleanerId, assigned_at: new Date().toISOString() })
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `${preview.cleaner} has been assigned to ${preview.customer}'s job on ${preview.jobDate}` }
    }

    case 'update_booking_status': {
      const occurrenceId = preview._occurrenceId as string
      const newStatus = args.newStatus as string

      if (!occurrenceId || !newStatus) {
        return { success: false, error: 'Missing booking ID or status' }
      }

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({ status: newStatus })
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Booking for ${preview.customer} has been marked as ${newStatus}` }
    }

    case 'update_lead_status': {
      const leadId = preview._leadId as string
      const newStatus = args.newStatus as string

      if (!leadId || !newStatus) {
        return { success: false, error: 'Missing lead ID or status' }
      }

      const { error } = await supabaseAdmin
        .from('extracted_leads')
        .update({ status: newStatus })
        .eq('id', leadId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `${preview.customer}'s status has been updated to "${newStatus}"` }
    }

    // === NEW ACTION EXECUTORS ===

    case 'create_lead': {
      const name = args.name as string
      const phone = args.phone as string | undefined
      const email = args.email as string | undefined
      const notes = args.notes as string | undefined
      const status = (args.status as string) || 'Inquiry'

      const { data: newLead, error } = await supabaseAdmin
        .from('extracted_leads')
        .insert({
          org_id: orgId,
          name,
          phone_number: phone,
          email,
          region_notes: notes,
          status,
          first_contact: new Date().toISOString(),
          extracted_at: new Date().toISOString()
        })
        .select('id, name')
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Created new lead: ${newLead.name}` }
    }

    case 'create_quote': {
      const leadId = preview._leadId as string
      const quoteResult = preview._quoteResult as any

      if (!quoteResult) {
        return { success: false, error: 'Quote calculation failed' }
      }

      // Generate quote number and share token
      const quoteNumber = generateQuoteNumber()
      const shareToken = generateShareToken()

      const { data: newQuote, error } = await supabaseAdmin
        .from('quotes')
        .insert({
          org_id: orgId,
          lead_id: leadId || null,
          quote_number: quoteNumber,
          share_token: shareToken,
          service: args.service,
          bedrooms: args.bedrooms,
          bathrooms: args.bathrooms,
          addons: args.addons || [],
          custom_addons: args.customAddons || [],
          address: args.address || null,
          notes: args.notes || null,
          customer_name: preview._leadName || args.customerName || null,
          customer_email: preview._leadEmail || args.customerEmail || null,
          customer_phone: preview._leadPhone || args.customerPhone || null,
          hourly_rate: (ctx.org.default_client_hourly_rate as number) || DEFAULT_PRICING.CLIENT_HOURLY_RATE,
          cleaner_rate: (ctx.org.default_cleaner_hourly_rate as number) || DEFAULT_PRICING.CLEANER_HOURLY_RATE,
          cleaner_rate_type: 'hour',
          main_service_hours: quoteResult.mainServiceHours,
          add_on_hours: quoteResult.totalAddOnHours,
          total_hours: quoteResult.totalLaborHours,
          subtotal: quoteResult.subtotal,
          discount_amount: quoteResult.discountAmount,
          discount_percentage: args.discountPercentage || 0,
          net_revenue: quoteResult.netRevenue,
          gst: quoteResult.gst,
          total_inc_gst: quoteResult.totalIncGst,
          cleaner_pay: quoteResult.cleanerPay,
          profit: quoteResult.profit,
          margin: quoteResult.profitMarginPct,
          deposit_percentage: args.depositPercentage || 0,
          deposit_amount: quoteResult.depositAmount,
          remaining_balance: quoteResult.remainingBalance
        })
        .select('id, quote_number, total_inc_gst')
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Created quote #${newQuote.quote_number} for $${newQuote.total_inc_gst.toFixed(2)}`
      }
    }

    case 'create_booking': {
      const quoteId = preview._quoteId as string
      const leadId = preview._leadId as string
      const startDateTime = args.startDateTime as string

      if (!quoteId) {
        return { success: false, error: 'Quote ID is required' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      const response = await fetch(`${supabaseUrl}/functions/v1/create-booking-series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({
          leadId,
          quoteId,
          startsAt: startDateTime,
          repeatType: args.repeatType || 'none',
          durationMinutes: args.durationMinutes || 120,
          untilDate: args.untilDate,
          occurrenceCount: args.occurrenceCount,
          notes: args.notes,
          updateLeadStatus: true
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to create booking: ${errorText}` }
      }

      const result = await response.json()
      return {
        success: true,
        message: `Created booking with ${result.occurrences_created || 1} occurrence(s) starting ${preview.startDate} at ${preview.startTime}`
      }
    }

    case 'initiate_call': {
      const phone = preview._phone as string

      if (!phone) {
        return { success: false, error: 'Phone number is required' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-initiate-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ phone_number: phone })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to initiate call: ${errorText}` }
      }

      return { success: true, message: `Initiated call to ${preview.customer} at ${phone}` }
    }

    case 'create_payment_link': {
      const amountCents = preview._amountCents as number

      if (!amountCents) {
        return { success: false, error: 'Amount is required' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      const response = await fetch(`${supabaseUrl}/functions/v1/create-payment-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({
          amount_cents: amountCents,
          currency: 'aud',
          description: args.description || `Payment for ${preview.customer}`,
          quoteId: preview._quoteId,
          customerName: preview.customer,
          customerEmail: preview._customerEmail
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to create payment link: ${errorText}` }
      }

      const result = await response.json()
      return {
        success: true,
        message: `Created payment link for ${preview.amount}: ${result.url}`
      }
    }

    case 'start_marketing_loop':
    case 'pause_marketing_loop':
    case 'cancel_marketing_loop': {
      const leadId = preview._leadId as string
      const journeyType = preview._journeyType as string || 'both'
      const action = toolName === 'start_marketing_loop' ? 'start'
        : toolName === 'pause_marketing_loop' ? 'pause'
        : 'cancel'

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      const response = await fetch(`${supabaseUrl}/functions/v1/marketing-loop-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({
          action,
          leadId,
          journeyType
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to ${action} marketing: ${errorText}` }
      }

      const actionPastTense = action === 'start' ? 'started' : action === 'pause' ? 'paused' : 'cancelled'
      return {
        success: true,
        message: `Marketing automation ${actionPastTense} for ${preview.customer}`
      }
    }

    case 'reschedule_booking': {
      const occurrenceId = preview._occurrenceId as string
      const newDateTime = preview._newDateTime as string

      if (!occurrenceId || !newDateTime) {
        return { success: false, error: 'Missing booking ID or new date/time' }
      }

      const newDate = new Date(newDateTime)
      const durationMs = 2 * 60 * 60 * 1000 // Default 2 hours
      const endAt = new Date(newDate.getTime() + durationMs)

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({
          start_at: newDate.toISOString(),
          end_at: endAt.toISOString(),
          original_start_at: newDate.toISOString()
        })
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Rescheduled ${preview.customer}'s booking to ${preview.newDate} at ${preview.newTime}`
      }
    }

    case 'cancel_booking_series': {
      const seriesId = preview._seriesId as string

      if (!seriesId) {
        return { success: false, error: 'Missing series ID' }
      }

      // Cancel all future scheduled occurrences
      const { error: occError } = await supabaseAdmin
        .from('booking_occurrences')
        .update({ status: 'cancelled' })
        .eq('series_id', seriesId)
        .eq('org_id', orgId)
        .eq('status', 'scheduled')
        .gte('start_at', new Date().toISOString())

      if (occError) {
        return { success: false, error: occError.message }
      }

      // Update series status
      const { error: seriesError } = await supabaseAdmin
        .from('booking_series')
        .update({ status: 'cancelled' })
        .eq('id', seriesId)
        .eq('org_id', orgId)

      if (seriesError) {
        return { success: false, error: seriesError.message }
      }

      return {
        success: true,
        message: `Cancelled ${preview.futureBookingsToCancel} future booking(s) for ${preview.customer}`
      }
    }

    // === NEW ACTION EXECUTORS ===

    case 'update_lead': {
      const leadId = preview._leadId as string

      if (!leadId) {
        return { success: false, error: 'Missing lead ID' }
      }

      const updates: Record<string, unknown> = {}

      if (preview._newPhone) {
        updates.phone_number = preview._newPhone
      }
      if (preview._newEmail) {
        updates.email = preview._newEmail
      }
      if (preview._newAddress) {
        updates.address = preview._newAddress
      }
      if (preview._newNotes) {
        updates.region_notes = preview._newNotes
      }
      if (preview._appendNotes) {
        const currentNotes = (preview._currentNotes as string) || ''
        updates.region_notes = currentNotes
          ? `${currentNotes}\n${preview._appendNotes}`
          : preview._appendNotes
      }

      const { error } = await supabaseAdmin
        .from('extracted_leads')
        .update(updates)
        .eq('id', leadId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Updated ${preview.customer}'s information`
      }
    }

    case 'edit_quote': {
      const quoteId = preview._quoteId as string

      if (!quoteId) {
        return { success: false, error: 'Missing quote ID' }
      }

      const updates: Record<string, unknown> = {}

      if (preview._newAddons) {
        updates.addons = preview._newAddons
      }
      if (preview._newDiscountPercentage !== undefined) {
        updates.discount_percentage = preview._newDiscountPercentage
      }
      if (preview._newAddress) {
        updates.address = preview._newAddress
      }
      if (preview._newNotes) {
        updates.notes = preview._newNotes
      }

      // TODO: Recalculate pricing if addons or discount changed
      // For now, just update the fields

      const { error } = await supabaseAdmin
        .from('quotes')
        .update(updates)
        .eq('id', quoteId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Updated quote #${preview.quoteNumber} for ${preview.customer}`
      }
    }

    case 'mark_booking_paid': {
      const occurrenceId = preview._occurrenceId as string
      const amount = preview._amount as number
      const paymentMethod = preview._paymentMethod as string

      if (!occurrenceId) {
        return { success: false, error: 'Missing booking ID' }
      }

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({
          payment_status: 'paid',
          payment_method: paymentMethod,
          payment_amount: amount,
          paid_at: new Date().toISOString()
        })
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Recorded ${preview.amount} ${paymentMethod} payment for ${preview.customer}'s job on ${preview.jobDate}`
      }
    }

    case 'update_booking': {
      const occurrenceId = preview._occurrenceId as string
      const seriesId = preview._seriesId as string

      if (!occurrenceId) {
        return { success: false, error: 'Missing booking ID' }
      }

      // Update occurrence notes
      let newNotes = preview._newNotes as string | undefined
      if (preview._appendNotes) {
        const currentNotes = (preview._currentNotes as string) || ''
        newNotes = currentNotes
          ? `${currentNotes}\n${preview._appendNotes}`
          : preview._appendNotes as string
      }

      if (newNotes !== undefined) {
        // Update both occurrence and series notes
        const { error: occError } = await supabaseAdmin
          .from('booking_occurrences')
          .update({ notes: newNotes })
          .eq('id', occurrenceId)
          .eq('org_id', orgId)

        if (occError) {
          return { success: false, error: occError.message }
        }

        if (seriesId) {
          await supabaseAdmin
            .from('booking_series')
            .update({ notes: newNotes })
            .eq('id', seriesId)
            .eq('org_id', orgId)
        }
      }

      return {
        success: true,
        message: `Updated booking for ${preview.customer} on ${preview.jobDate}`
      }
    }

    default:
      return { success: false, error: `Unknown action: ${toolName}` }
  }
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completion
// ---------------------------------------------------------------------------

async function callOpenAI(
  openaiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools: unknown[]
): Promise<{ message?: { role: string; content: string | null; tool_calls?: ToolCall[] }; error?: string }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { error: `OpenAI API error: ${errorText}` }
  }

  const data = await response.json()
  const choice = data.choices?.[0]

  if (!choice) {
    return { error: 'No response from OpenAI' }
  }

  return { message: choice.message }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
    const ctx = await resolveOrgFromRequest(req)
    const { orgId, org, supabaseAdmin } = ctx

    // Get OpenAI configuration
    const openaiConfig = await getOrgIntegration(supabaseAdmin, orgId, 'openai')
    const openaiKey = openaiConfig.api_key || ''
    const openaiModel = openaiConfig.model || 'gpt-4o'

    if (!openaiKey) {
      return jsonError('OpenAI integration not configured. Please add your OpenAI API key in Settings > Integrations.', 400)
    }

    // Parse request
    let payload: RequestPayload
    try {
      payload = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    const { messages, confirmAction } = payload

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError('messages array is required', 400)
    }

    // Build system prompt with context
    const today = new Date()
    const timezone = (org.timezone as string) || 'Australia/Sydney'
    const businessName = (org.business_name as string) || 'Your Business'

    const systemPrompt = `You are an AI assistant for ${businessName}, a cleaning business CRM.

Current context:
- Today's date: ${today.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone })}
- Timezone: ${timezone}

Guidelines:
1. Be concise and helpful. Use Australian English.
2. Format dates in a readable way (e.g., "Tuesday, 15 February 2026").
3. Format currency as AUD with $ symbol.
4. For queries, summarize results conversationally - don't just list raw data.
5. For actions that modify data, always explain what you're about to do before calling the tool.
6. If a request is ambiguous, ask clarifying questions.
7. Never reveal internal database IDs to users - use names and readable identifiers.

Lead statuses: Inquiry, Quoted, Quote Sent, Quote Accepted, Booking Confirmed, Marketing Loop, Lost, DNQ, No Further Contact
Booking statuses: scheduled, completed, cancelled, skipped
Payment statuses: waiting_payment, invoice_sent, paid

You can query the CRM data and perform actions. Actions that modify data will require user confirmation.`

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ]

    // If this is a confirmation response, execute the action
    if (confirmAction) {
      if (!confirmAction.confirmed) {
        return jsonResponse({
          type: 'message',
          content: 'Action cancelled.'
        })
      }

      // Check if we have the action details
      if (!confirmAction.toolName || !confirmAction.arguments || !confirmAction.preview) {
        return jsonResponse({
          type: 'message',
          content: 'Sorry, I lost track of the action. Please describe what you want to do again.'
        })
      }

      // Execute the confirmed action
      const result = await executeAction(
        ctx,
        confirmAction.toolName,
        confirmAction.arguments,
        confirmAction.preview
      )

      if (!result.success) {
        return jsonResponse({
          type: 'message',
          content: `Sorry, the action failed: ${result.error}`
        })
      }

      return jsonResponse({
        type: 'message',
        content: result.message || 'Action completed successfully.'
      })
    }

    // Call OpenAI
    const openaiResponse = await callOpenAI(openaiKey, openaiModel, openaiMessages, ALL_TOOLS)

    if (openaiResponse.error) {
      return jsonError(openaiResponse.error, 500)
    }

    const assistantMessage = openaiResponse.message
    if (!assistantMessage) {
      return jsonError('No response from assistant', 500)
    }

    // Check for tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall = assistantMessage.tool_calls[0]
      const toolName = toolCall.function?.name || toolCall.name
      const toolArgs = typeof toolCall.function?.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : (toolCall.arguments || {})

      // Check if it's an action tool (requires confirmation)
      if (ACTION_TOOL_NAMES.includes(toolName)) {
        const { preview, error } = await generateActionPreview(ctx, toolName, toolArgs)

        if (error) {
          return jsonResponse({
            type: 'message',
            content: `I couldn't prepare that action: ${error}`
          })
        }

        return jsonResponse({
          type: 'confirmation_required',
          toolCall: {
            id: toolCall.id,
            name: toolName,
            arguments: toolArgs
          },
          preview,
          message: assistantMessage.content
        })
      }

      // It's a query tool - execute it
      let result: { success: boolean; data?: unknown; error?: string }

      switch (toolName) {
        case 'get_bookings':
          result = await handleGetBookings(ctx, toolArgs)
          break
        case 'get_leads':
          result = await handleGetLeads(ctx, toolArgs)
          break
        case 'get_quotes':
          result = await handleGetQuotes(ctx, toolArgs)
          break
        case 'get_cleaners':
          result = await handleGetCleaners(ctx, toolArgs)
          break
        case 'search_crm':
          result = await handleSearchCrm(ctx, toolArgs)
          break
        case 'get_pricing_rules':
          result = await handleGetPricingRules(ctx, toolArgs)
          break
        case 'get_org_settings':
          result = await handleGetOrgSettings(ctx, toolArgs)
          break
        case 'get_communications_log':
          result = await handleGetCommunicationsLog(ctx, toolArgs)
          break
        case 'get_marketing_status':
          result = await handleGetMarketingStatus(ctx, toolArgs)
          break
        case 'get_cleaner_schedule':
          result = await handleGetCleanerSchedule(ctx, toolArgs)
          break
        case 'get_analytics':
          result = await handleGetAnalytics(ctx, toolArgs)
          break
        default:
          result = { success: false, error: `Unknown tool: ${toolName}` }
      }

      if (!result.success) {
        return jsonResponse({
          type: 'message',
          content: `Sorry, I encountered an error: ${result.error}`
        })
      }

      // Call OpenAI again with the tool result to get a natural language response
      const toolResultMessages = [
        ...openaiMessages,
        { role: 'assistant', content: null, tool_calls: [toolCall] },
        { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result.data) }
      ]

      const finalResponse = await callOpenAI(openaiKey, openaiModel, toolResultMessages, [])

      if (finalResponse.error) {
        // Return the raw data if OpenAI fails
        return jsonResponse({
          type: 'message',
          content: `Here's what I found:\n\n${JSON.stringify(result.data, null, 2)}`,
          toolResult: result.data
        })
      }

      return jsonResponse({
        type: 'message',
        content: finalResponse.message?.content || 'Here are the results.',
        toolResult: result.data
      })
    }

    // No tool calls - return the assistant's message directly
    return jsonResponse({
      type: 'message',
      content: assistantMessage.content || 'I\'m not sure how to help with that. Could you please rephrase?'
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' || message.includes('not a member') ? 401 : 500
    return jsonError(message, status)
  }
})
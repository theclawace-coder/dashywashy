import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { resolveOrgFromRequest, getOrgIntegration, getAutomationSetting, corsHeaders, jsonResponse, jsonError, OrgContext } from '../_shared/org-resolver.ts'
import { calculateQuote, generateQuoteNumber, generateShareToken, SERVICE_HOURS, STANDARD_ADD_ONS, ADDON_DISPLAY_NAMES, DEFAULT_PRICING, type ServiceType, type QuoteInput } from '../_shared/quote-calculator.ts'

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
// Phone helpers
// ---------------------------------------------------------------------------

function normalizePhoneToE164AU(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const raw = input.trim()
  if (!raw) return undefined

  // Keep only digits and an optional leading "+" (drop spaces/brackets/dashes etc.)
  let compact = raw.replace(/[^\d+]/g, '')

  // Convert international dialing prefix (00...) to +...
  if (compact.startsWith('00')) {
    compact = '+' + compact.slice(2)
  }

  // +<digits>
  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '')
    if (!digits) return undefined

    // Common user mistake: +6104... / +6102... -> +614... / +612...
    const fixedDigits = digits.startsWith('610') ? `61${digits.slice(3)}` : digits
    if (fixedDigits.length < 8 || fixedDigits.length > 15) return undefined
    return `+${fixedDigits}`
  }

  const digitsOnly = compact.replace(/\D/g, '')
  if (!digitsOnly) return undefined

  // Already includes AU country code without +
  if (digitsOnly.startsWith('61')) {
    if (digitsOnly.length < 8 || digitsOnly.length > 15) return undefined
    return `+${digitsOnly}`
  }

  // AU national format (e.g. 0412345678, 0212345678) -> +61...
  if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    return `+61${digitsOnly.slice(1)}`
  }

  // AU mobile without the leading 0 (e.g. 412345678) -> +614...
  if (digitsOnly.startsWith('4') && digitsOnly.length === 9) {
    return `+61${digitsOnly}`
  }

  // Unrecognized format; let callers decide whether to keep raw input.
  return undefined
}

function formatCurrencyAUD(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'N/A'
  return `$${Number(value).toFixed(2)}`
}

function formatAmountCents(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  return `$${(Number(value) / 100).toFixed(2)}`
}

function getSiteUrl(): string {
  return (
    Deno.env.get('SITE_URL') ||
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('APP_URL') ||
    'http://localhost:5173'
  )
}

function buildQuoteShareUrl(shareToken: string): string {
  const base = getSiteUrl()
  try {
    const url = new URL(base)
    url.searchParams.set('quote', shareToken)
    return url.toString()
  } catch {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
    return `${trimmed}?quote=${shareToken}`
  }
}

function getReviewLink(): string {
  return (
    Deno.env.get('GOOGLE_REVIEW_URL') ||
    Deno.env.get('REVIEW_URL') ||
    'https://g.page/r/CleaningReview'
  )
}

function fillTemplate(body: string, replacements: Record<string, string>): string {
  let output = body
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), value)
  }
  return output
}

function repeatTypeToRRule(repeatType: string | undefined): string | null {
  switch (repeatType) {
    case 'weekly':
      return 'FREQ=WEEKLY;INTERVAL=1'
    case 'fortnightly':
      return 'FREQ=WEEKLY;INTERVAL=2'
    case '3-weekly':
      return 'FREQ=WEEKLY;INTERVAL=3'
    case 'monthly':
      return 'FREQ=MONTHLY;INTERVAL=1'
    case '2-monthly':
      return 'FREQ=MONTHLY;INTERVAL=2'
    case 'none':
      return null
    default:
      return null
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
            enum: ['Unanswered', 'Marketing Loop', 'Follow Up', 'Quote Sent', 'Job Won', 'Jobs Completed', 'Not interested'],
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
  },
  {
    type: 'function',
    function: {
      name: 'get_quote_share_link',
      description: 'Get the public share link for a quote.',
      parameters: {
        type: 'object',
        properties: {
          quoteId: {
            type: 'string',
            description: 'Quote ID if known'
          },
          quoteNumber: {
            type: 'string',
            description: 'Quote number if known'
          },
          customerName: {
            type: 'string',
            description: 'Customer name to find the quote'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_todos',
      description: 'Fetch manual todos.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'completed', 'all'],
            description: 'Filter by completion status'
          },
          limit: {
            type: 'number',
            description: 'Maximum results (default 50)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_cleaner_payouts',
      description: 'Fetch cleaner payouts (paid/unpaid).',
      parameters: {
        type: 'object',
        properties: {
          cleanerName: {
            type: 'string',
            description: 'Cleaner name to filter'
          },
          status: {
            type: 'string',
            enum: ['paid', 'unpaid', 'all'],
            description: 'Payout status filter'
          },
          limit: {
            type: 'number',
            description: 'Maximum results (default 50)'
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
            description: 'Phone number if known (will be normalised to E.164; AU mobile example: +61412345678)'
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
            enum: ['Unanswered', 'Marketing Loop', 'Follow Up', 'Quote Sent', 'Job Won', 'Jobs Completed', 'Not interested'],
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
            description: 'Phone number (will be saved in E.164; AU mobile example: +61412345678; local example: 0412345678)'
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
            enum: ['Unanswered', 'Marketing Loop', 'Follow Up', 'Quote Sent', 'Job Won', 'Jobs Completed', 'Not interested'],
            description: 'Initial status (default: Unanswered)'
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
            description: 'Phone number if known (will be normalised to E.164; AU mobile example: +61412345678)'
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
          occurrenceId: {
            type: 'string',
            description: 'Booking occurrence ID to create payment link for'
          },
          jobDate: {
            type: 'string',
            description: 'Date of booking (YYYY-MM-DD) if occurrenceId not known'
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
            description: 'New phone number (will be saved in E.164; AU mobile example: +61412345678)'
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
          service: {
            type: 'string',
            enum: ['general', 'deep', 'move'],
            description: 'Update service type'
          },
          bedrooms: {
            type: 'number',
            description: 'Update number of bedrooms'
          },
          bathrooms: {
            type: 'number',
            description: 'Update number of bathrooms'
          },
          setAddons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replace add-ons with this list'
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
          customAddons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number' }
              }
            },
            description: 'Replace custom add-ons with this list'
          },
          newDiscountPercentage: {
            type: 'number',
            description: 'New discount percentage (0-100)'
          },
          newDepositPercentage: {
            type: 'number',
            description: 'New deposit percentage (0-100)'
          },
          newHourlyRate: {
            type: 'number',
            description: 'Override customer hourly rate'
          },
          newCleanerRate: {
            type: 'number',
            description: 'Override cleaner hourly rate'
          },
          newCleanerRateType: {
            type: 'string',
            enum: ['hour', 'job'],
            description: 'Cleaner pay type'
          },
          newAddress: {
            type: 'string',
            description: 'New service address'
          },
          newAddressLat: {
            type: 'number',
            description: 'Latitude for new address'
          },
          newAddressLng: {
            type: 'number',
            description: 'Longitude for new address'
          },
          newNotes: {
            type: 'string',
            description: 'New internal notes'
          },
          newDescription: {
            type: 'string',
            description: 'New quote description/summary'
          },
          newCustomerName: {
            type: 'string',
            description: 'Update customer name on the quote'
          },
          newCustomerEmail: {
            type: 'string',
            description: 'Update customer email on the quote'
          },
          newCustomerPhone: {
            type: 'string',
            description: 'Update customer phone on the quote'
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
  },
  // === LEAD & QUOTE ACTIONS ===
  {
    type: 'function',
    function: {
      name: 'extract_lead_info',
      description: 'Extract lead details from a specific email and save them to the CRM. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          emailId: {
            type: 'string',
            description: 'Email ID from communications log'
          },
          fromEmail: {
            type: 'string',
            description: 'Filter by sender email if emailId not known'
          },
          subjectContains: {
            type: 'string',
            description: 'Filter by email subject if emailId not known'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_lead',
      description: 'Delete a lead/customer from the CRM. REQUIRES CONFIRMATION before executing.',
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
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_lead_sms',
      description: 'Send an SMS to a lead using a saved template or a custom message. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer/lead name'
          },
          leadId: {
            type: 'string',
            description: 'Lead ID if known'
          },
          phoneNumber: {
            type: 'string',
            description: 'Phone number override (optional)'
          },
          templateId: {
            type: 'string',
            description: 'SMS template ID (optional)'
          },
          templateSlug: {
            type: 'string',
            description: 'SMS template slug (optional)'
          },
          message: {
            type: 'string',
            description: 'Custom message (optional, overrides template)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_quote_sms',
      description: 'Send a quote via SMS including the share link. REQUIRES CONFIRMATION before executing.',
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
          phoneNumber: {
            type: 'string',
            description: 'Phone number override (optional)'
          },
          message: {
            type: 'string',
            description: 'Custom message (optional, overrides default template)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_quote',
      description: 'Delete a quote. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          quoteId: {
            type: 'string',
            description: 'Quote ID if known'
          },
          quoteNumber: {
            type: 'string',
            description: 'Quote number if known'
          },
          customerName: {
            type: 'string',
            description: 'Customer name to find the quote'
          }
        },
        required: []
      }
    }
  },
  // === BOOKING / PAYMENT ACTIONS ===
  {
    type: 'function',
    function: {
      name: 'unassign_cleaner',
      description: 'Remove a cleaner assignment from a booking. REQUIRES CONFIRMATION before executing.',
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
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_booking_address',
      description: 'Update the service address for a booking series. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          seriesId: {
            type: 'string',
            description: 'Booking series ID if known'
          },
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking series'
          },
          address: {
            type: 'string',
            description: 'New service address'
          },
          latitude: {
            type: 'number',
            description: 'Latitude for the new address'
          },
          longitude: {
            type: 'number',
            description: 'Longitude for the new address'
          }
        },
        required: ['address']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_booking_series',
      description: 'Update booking series details (repeat pattern, duration, notes). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          seriesId: {
            type: 'string',
            description: 'Booking series ID if known'
          },
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking series'
          },
          title: {
            type: 'string',
            description: 'New title for the booking series'
          },
          durationMinutes: {
            type: 'number',
            description: 'Duration in minutes'
          },
          repeatType: {
            type: 'string',
            enum: ['none', 'weekly', 'fortnightly', '3-weekly', 'monthly', '2-monthly'],
            description: 'Recurrence pattern'
          },
          untilDate: {
            type: 'string',
            description: 'End date for recurring bookings (YYYY-MM-DD)'
          },
          occurrenceCount: {
            type: 'number',
            description: 'Number of occurrences to generate'
          },
          timezone: {
            type: 'string',
            description: 'Timezone (e.g., Australia/Sydney)'
          },
          status: {
            type: 'string',
            enum: ['active', 'paused', 'cancelled'],
            description: 'Series status'
          },
          notes: {
            type: 'string',
            description: 'Notes for the booking series'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_payment_status',
      description: 'Update payment status for a booking. REQUIRES CONFIRMATION before executing.',
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
          paymentStatus: {
            type: 'string',
            enum: ['waiting_payment', 'invoice_sent', 'paid'],
            description: 'New payment status'
          },
          amountDollars: {
            type: 'number',
            description: 'Payment amount in AUD dollars (optional)'
          },
          notes: {
            type: 'string',
            description: 'Payment notes (optional)'
          }
        },
        required: ['paymentStatus']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_payment_reminder_sms',
      description: 'Send a payment reminder SMS using a template. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          occurrenceId: {
            type: 'string',
            description: 'Booking occurrence ID'
          },
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          jobDate: {
            type: 'string',
            description: 'Date of the job (YYYY-MM-DD)'
          },
          templateId: {
            type: 'string',
            description: 'Payment SMS template ID (optional)'
          },
          templateSlug: {
            type: 'string',
            description: 'Payment SMS template slug (optional)'
          },
          message: {
            type: 'string',
            description: 'Custom message override (optional)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_review_reminder_sms',
      description: 'Send a review reminder SMS using a template. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          occurrenceId: {
            type: 'string',
            description: 'Booking occurrence ID'
          },
          customerName: {
            type: 'string',
            description: 'Customer name to find the booking'
          },
          jobDate: {
            type: 'string',
            description: 'Date of the job (YYYY-MM-DD)'
          },
          templateId: {
            type: 'string',
            description: 'Review SMS template ID (optional)'
          },
          templateSlug: {
            type: 'string',
            description: 'Review SMS template slug (optional)'
          },
          message: {
            type: 'string',
            description: 'Custom message override (optional)'
          },
          reviewLink: {
            type: 'string',
            description: 'Override review link (optional)'
          }
        },
        required: []
      }
    }
  },
  // === MARKETING LOOP ACTIONS ===
  {
    type: 'function',
    function: {
      name: 'resume_marketing_loop',
      description: 'Resume marketing automation for a lead. REQUIRES CONFIRMATION before executing.',
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
            description: 'Journey type to resume (default: both)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_marketing_now',
      description: 'Send the next marketing step immediately. REQUIRES CONFIRMATION before executing.',
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
            enum: ['sms', 'email'],
            description: 'Journey type to send now'
          }
        },
        required: ['journeyType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_marketing_step',
      description: 'Set the current step for a marketing journey. REQUIRES CONFIRMATION before executing.',
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
            description: 'Journey type to update'
          },
          step: {
            type: 'number',
            description: 'Step number to set (1-7)'
          }
        },
        required: ['step']
      }
    }
  },
  // === CLEANER / PAYOUT ACTIONS ===
  {
    type: 'function',
    function: {
      name: 'create_cleaner',
      description: 'Create a new cleaner profile. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          fullName: { type: 'string', description: 'Cleaner full name' },
          phone: { type: 'string', description: 'Cleaner phone number' },
          email: { type: 'string', description: 'Cleaner email address' },
          baseLocationText: { type: 'string', description: 'Base location text' },
          baseLat: { type: 'number', description: 'Base latitude' },
          baseLng: { type: 'number', description: 'Base longitude' },
          abn: { type: 'string', description: 'ABN' },
          bankAccountName: { type: 'string', description: 'Bank account name' },
          bankBsb: { type: 'string', description: 'Bank BSB' },
          bankAccountNumber: { type: 'string', description: 'Bank account number' },
          minBookingMinutes: { type: 'number', description: 'Minimum booking minutes' },
          noticeHours: { type: 'number', description: 'Notice required (hours)' },
          cancellationPolicy: { type: 'string', description: 'Cancellation policy' },
          hasTransport: { type: 'boolean', description: 'Has transport' },
          transportType: { type: 'string', description: 'Transport type' },
          maxTravelKm: { type: 'number', description: 'Max travel distance in km' },
          canTransportEquipment: { type: 'boolean', description: 'Can transport equipment' },
          publicLiabilityPolicyNumber: { type: 'string', description: 'Public liability policy number' },
          publicLiabilityExpiry: { type: 'string', description: 'Public liability expiry date' },
          teamSize: { type: 'number', description: 'Team size' },
          rates: { type: 'object', description: 'Rates JSON object' },
          availability: { type: 'object', description: 'Availability matrix' },
          active: { type: 'boolean', description: 'Is active' }
        },
        required: ['fullName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_cleaner',
      description: 'Update a cleaner profile. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          cleanerId: { type: 'string', description: 'Cleaner ID if known' },
          cleanerName: { type: 'string', description: 'Cleaner name to search' },
          fullName: { type: 'string', description: 'Cleaner full name' },
          phone: { type: 'string', description: 'Cleaner phone number' },
          email: { type: 'string', description: 'Cleaner email address' },
          baseLocationText: { type: 'string', description: 'Base location text' },
          baseLat: { type: 'number', description: 'Base latitude' },
          baseLng: { type: 'number', description: 'Base longitude' },
          abn: { type: 'string', description: 'ABN' },
          bankAccountName: { type: 'string', description: 'Bank account name' },
          bankBsb: { type: 'string', description: 'Bank BSB' },
          bankAccountNumber: { type: 'string', description: 'Bank account number' },
          minBookingMinutes: { type: 'number', description: 'Minimum booking minutes' },
          noticeHours: { type: 'number', description: 'Notice required (hours)' },
          cancellationPolicy: { type: 'string', description: 'Cancellation policy' },
          hasTransport: { type: 'boolean', description: 'Has transport' },
          transportType: { type: 'string', description: 'Transport type' },
          maxTravelKm: { type: 'number', description: 'Max travel distance in km' },
          canTransportEquipment: { type: 'boolean', description: 'Can transport equipment' },
          publicLiabilityPolicyNumber: { type: 'string', description: 'Public liability policy number' },
          publicLiabilityExpiry: { type: 'string', description: 'Public liability expiry date' },
          teamSize: { type: 'number', description: 'Team size' },
          rates: { type: 'object', description: 'Rates JSON object' },
          availability: { type: 'object', description: 'Availability matrix' },
          active: { type: 'boolean', description: 'Is active' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_cleaner',
      description: 'Delete a cleaner profile. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          cleanerId: { type: 'string', description: 'Cleaner ID if known' },
          cleanerName: { type: 'string', description: 'Cleaner name to search' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_cleaner_review',
      description: 'Create a cleaner job review. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          occurrenceId: { type: 'string', description: 'Booking occurrence ID' },
          cleanerId: { type: 'string', description: 'Cleaner ID (optional)' },
          cleanerName: { type: 'string', description: 'Cleaner name (optional)' },
          rating: { type: 'number', description: 'Rating 1-5' },
          notes: { type: 'string', description: 'Review notes' }
        },
        required: ['rating']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_cleaner_payout',
      description: 'Update cleaner payout amount or notes. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          payoutId: { type: 'string', description: 'Payout ID if known' },
          occurrenceId: { type: 'string', description: 'Booking occurrence ID to find payout' },
          payoutAmount: { type: 'number', description: 'New payout amount' },
          notes: { type: 'string', description: 'Notes' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_cleaner_payout_paid',
      description: 'Mark a cleaner payout as paid or unpaid. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          payoutId: { type: 'string', description: 'Payout ID if known' },
          occurrenceId: { type: 'string', description: 'Booking occurrence ID to find payout' },
          markPaid: { type: 'boolean', description: 'Set to true to mark paid, false to mark unpaid' }
        },
        required: []
      }
    }
  },
  // === TODOS ===
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: 'Create a manual todo. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Todo title' },
          description: { type: 'string', description: 'Todo description' },
          dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
          rollOver: { type: 'boolean', description: 'Roll over if missed (default true)' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: 'Update a manual todo. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: 'Todo ID' },
          title: { type: 'string', description: 'Todo title' },
          description: { type: 'string', description: 'Todo description' },
          isCompleted: { type: 'boolean', description: 'Mark as completed' },
          dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' }
        },
        required: ['todoId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: 'Delete a manual todo. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: 'Todo ID' }
        },
        required: ['todoId']
      }
    }
  },
  // === ADMIN SETTINGS ===
  {
    type: 'function',
    function: {
      name: 'send_team_invite',
      description: 'Invite a team member to the organization. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Invitee email' },
          role: { type: 'string', enum: ['owner', 'admin', 'staff'], description: 'Invite role' }
        },
        required: ['email']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_member_role',
      description: 'Update a team member role. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'Member ID if known' },
          email: { type: 'string', description: 'Member email to search' },
          role: { type: 'string', enum: ['owner', 'admin', 'manager', 'staff', 'cleaner'], description: 'New role' }
        },
        required: ['role']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_member',
      description: 'Remove a team member from the organization. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'Member ID if known' },
          email: { type: 'string', description: 'Member email to search' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'revoke_invite',
      description: 'Revoke a pending team invite. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          inviteId: { type: 'string', description: 'Invite ID if known' },
          email: { type: 'string', description: 'Invitee email to search' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_integration',
      description: 'Update organization integrations (API keys, enabled state). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['stripe', 'dialpad', 'outlook', 'resend', 'openai', 'mapbox'], description: 'Integration provider' },
          enabled: { type: 'boolean', description: 'Enable/disable integration' },
          config: { type: 'object', description: 'Integration config object' }
        },
        required: ['provider']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_org_settings',
      description: 'Update organization settings (business details, pricing, branding). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'Business name' },
          abn: { type: 'string', description: 'ABN' },
          phone: { type: 'string', description: 'Business phone' },
          email: { type: 'string', description: 'Business email' },
          operatingName: { type: 'string', description: 'Trading name' },
          timezone: { type: 'string', description: 'Timezone' },
          clientRate: { type: 'number', description: 'Default client hourly rate' },
          cleanerRate: { type: 'number', description: 'Default cleaner hourly rate' },
          gstRate: { type: 'number', description: 'GST rate (decimal)' },
          discountPct: { type: 'number', description: 'Default discount percentage' },
          depositPct: { type: 'number', description: 'Default deposit percentage' },
          logoUrl: { type: 'string', description: 'Logo URL' },
          primaryColor: { type: 'string', description: 'Primary color' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_automation_setting',
      description: 'Update automation settings for the organization. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          automationType: {
            type: 'string',
            enum: ['marketing_sms', 'marketing_email', 'booking_completion', 'booking_reminder', 'quote_email', 'payment_sms', 'review_sms', 'daily_summary'],
            description: 'Automation type'
          },
          enabled: { type: 'boolean', description: 'Enable/disable automation' },
          config: { type: 'object', description: 'Automation config JSON' }
        },
        required: ['automationType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_template',
      description: 'Update a messaging template (marketing/payment/review). REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          templateType: { type: 'string', enum: ['marketing_sms', 'marketing_email', 'payment_sms', 'review_sms'], description: 'Template type' },
          templateId: { type: 'string', description: 'Template ID' },
          title: { type: 'string', description: 'Template title' },
          subject: { type: 'string', description: 'Email subject (marketing_email only)' },
          body: { type: 'string', description: 'Template body' }
        },
        required: ['templateType', 'templateId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_default_template',
      description: 'Set the default payment or review SMS template. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          templateType: { type: 'string', enum: ['payment_sms', 'review_sms'], description: 'Template type' },
          templateId: { type: 'string', description: 'Template ID to set as default' }
        },
        required: ['templateType', 'templateId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_sms_template',
      description: 'Create a custom SMS template. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Template title' },
          body: { type: 'string', description: 'Template body' }
        },
        required: ['body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_workflow',
      description: 'Create an automation workflow. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workflow name' },
          description: { type: 'string', description: 'Workflow description' },
          enabled: { type: 'boolean', description: 'Enable workflow' },
          triggerType: { type: 'string', enum: ['lead_status_change', 'time_based', 'event_based'], description: 'Trigger type' },
          triggerConfig: { type: 'object', description: 'Trigger config JSON' },
          steps: {
            type: 'array',
            description: 'Workflow steps',
            items: {
              type: 'object',
              properties: {
                actionType: { type: 'string' },
                actionConfig: { type: 'object' }
              }
            }
          }
        },
        required: ['name', 'triggerType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_workflow',
      description: 'Update an automation workflow. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' },
          name: { type: 'string', description: 'Workflow name' },
          description: { type: 'string', description: 'Workflow description' },
          enabled: { type: 'boolean', description: 'Enable workflow' },
          triggerType: { type: 'string', enum: ['lead_status_change', 'time_based', 'event_based'], description: 'Trigger type' },
          triggerConfig: { type: 'object', description: 'Trigger config JSON' },
          steps: {
            type: 'array',
            description: 'Workflow steps (replaces existing steps if provided)',
            items: {
              type: 'object',
              properties: {
                actionType: { type: 'string' },
                actionConfig: { type: 'object' }
              }
            }
          }
        },
        required: ['workflowId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_workflow',
      description: 'Delete a workflow. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' }
        },
        required: ['workflowId']
      }
    }
  },
  // === COMMUNICATIONS ===
  {
    type: 'function',
    function: {
      name: 'summarize_call',
      description: 'Fetch and summarize a call transcript. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {
          callId: { type: 'string', description: 'Dialpad call ID' },
          customerName: { type: 'string', description: 'Customer name to find the call' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sync_emails',
      description: 'Sync latest Outlook emails into the CRM. REQUIRES CONFIRMATION before executing.',
      parameters: {
        type: 'object',
        properties: {},
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

async function handleGetQuoteShareLink(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId } = ctx

  let query = supabaseAdmin
    .from('quotes')
    .select('id, quote_number, share_token, customer_name, lead:extracted_leads(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (args.quoteId) {
    query = query.eq('id', args.quoteId)
  } else if (args.quoteNumber) {
    query = query.eq('quote_number', args.quoteNumber)
  }

  const { data: quotes, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }
  if (!quotes || quotes.length === 0) {
    return { success: false, error: 'No quote found' }
  }

  let quote = quotes[0]
  if (args.customerName) {
    const search = (args.customerName as string).toLowerCase()
    quote = quotes.find((q: any) =>
      q.customer_name?.toLowerCase().includes(search) ||
      q.lead?.name?.toLowerCase().includes(search)
    ) || quote
  }

  const shareToken = quote.share_token || null
  const shareUrl = shareToken ? buildQuoteShareUrl(shareToken) : null

  return {
    success: true,
    data: {
      quoteId: quote.id,
      quoteNumber: quote.quote_number || quote.id.slice(0, 8),
      customer: quote.customer_name || quote.lead?.name || 'Unknown',
      shareToken,
      shareUrl
    }
  }
}

async function handleGetTodos(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId } = ctx
  const status = (args.status as string) || 'pending'
  const limit = Math.min((args.limit as number) || 50, 200)

  let query = supabaseAdmin
    .from('todos')
    .select('id, title, description, is_completed, created_at, completed_at, due_date')
    .eq('org_id', orgId)
    .eq('type', 'manual')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status === 'pending') {
    query = query.eq('is_completed', false)
  } else if (status === 'completed') {
    query = query.eq('is_completed', true)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    data: {
      todos: data || [],
      count: data?.length || 0
    }
  }
}

async function handleGetCleanerPayouts(
  ctx: OrgContext,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseAdmin, orgId, org } = ctx
  const timezone = (org.timezone as string) || 'Australia/Sydney'
  const status = (args.status as string) || 'all'
  const limit = Math.min((args.limit as number) || 50, 200)

  let query = supabaseAdmin
    .from('cleaner_payouts')
    .select(`
      id,
      occurrence_id,
      payout_amount,
      job_total,
      paid_at,
      notes,
      cleaner:cleaners(full_name),
      occurrence:booking_occurrences(start_at, series:booking_series(title, lead:extracted_leads(name)))
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status === 'paid') {
    query = query.not('paid_at', 'is', null)
  } else if (status === 'unpaid') {
    query = query.is('paid_at', null)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  let results = data || []
  if (args.cleanerName) {
    const search = (args.cleanerName as string).toLowerCase()
    results = results.filter((p: any) =>
      p.cleaner?.full_name?.toLowerCase().includes(search)
    )
  }

  const formatted = results.map((p: any) => ({
    id: p.id,
    cleaner: p.cleaner?.full_name || 'Unknown',
    customer: p.occurrence?.series?.lead?.name || 'Unknown',
    jobTitle: p.occurrence?.series?.title || 'Cleaning',
    jobDate: p.occurrence?.start_at
      ? new Date(p.occurrence.start_at).toLocaleDateString('en-AU', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: timezone })
      : null,
    payoutAmount: formatCurrencyAUD(p.payout_amount),
    jobTotal: formatCurrencyAUD(p.job_total),
    paidAt: p.paid_at
      ? new Date(p.paid_at).toLocaleDateString('en-AU', { timeZone: timezone })
      : null,
    notes: p.notes || null
  }))

  return { success: true, data: { payouts: formatted, count: formatted.length } }
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
      .in('status', ['Job Won', 'Jobs Completed', 'Won'])
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

      phone = normalizePhoneToE164AU(phone) || phone

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

      const normalizedPhone = normalizePhoneToE164AU(args.phone)
      const phonePreview = normalizedPhone || (args.phone as string | undefined) || 'Not provided'

      return {
        preview: {
          action: 'Create new lead',
          name: name,
          phone: phonePreview,
          email: args.email || 'Not provided',
          notes: args.notes || 'None',
          status: args.status || 'Unanswered'
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

      phone = normalizePhoneToE164AU(phone) || phone

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
      const amountOverride = args.amountDollars as number | undefined
      const occurrenceIdArg = args.occurrenceId as string | undefined
      const jobDateArg = args.jobDate as string | undefined
      let customerName = 'Unknown'
      let customerEmail: string | undefined
      let amountCents: number | null = null
      let description = (args.description as string) || undefined
      let quoteId: string | undefined
      let occurrenceId: string | undefined
      let shareToken: string | undefined
      let jobDateLabel: string | null = null

      if (occurrenceIdArg || jobDateArg) {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`
            id,
            start_at,
            payment_amount_cents,
            series:booking_series(title, quote_id, quote:quotes(id, total_inc_gst, share_token), lead:extracted_leads(name, email))
          `)
          .eq('org_id', orgId)
          .order('start_at', { ascending: false })
          .limit(20)

        if (occurrenceIdArg) {
          query = query.eq('id', occurrenceIdArg)
        }
        if (jobDateArg) {
          query = query.gte('start_at', jobDateArg + 'T00:00:00').lte('start_at', jobDateArg + 'T23:59:59')
        }

        const { data: bookings } = await query
        if (bookings?.length) {
          let booking = bookings[0]
          if (args.customerName) {
            const search = (args.customerName as string).toLowerCase()
            booking = bookings.find((b: any) =>
              b.series?.lead?.name?.toLowerCase().includes(search)
            ) || booking
          }

          occurrenceId = booking.id
          quoteId = booking.series?.quote_id || booking.series?.quote?.id
          customerName = booking.series?.lead?.name || 'Unknown'
          customerEmail = booking.series?.lead?.email || undefined
          shareToken = booking.series?.quote?.share_token || undefined
          jobDateLabel = booking.start_at ? new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : null

          const quoteTotal = booking.series?.quote?.total_inc_gst
          amountCents = typeof amountOverride === 'number'
            ? Math.round(amountOverride * 100)
            : booking.payment_amount_cents ?? (quoteTotal ? Math.round(quoteTotal * 100) : null)

          if (!description) {
            description = booking.series?.title || `Cleaning for ${customerName}`
          }
        }
      } else {
        let quoteQuery = supabaseAdmin
          .from('quotes')
          .select('id, customer_name, customer_email, total_inc_gst, share_token, lead:extracted_leads(name, email)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(10)

        if (args.quoteId) {
          quoteQuery = quoteQuery.eq('id', args.quoteId)
        }

        const { data: quotes } = await quoteQuery

        if (quotes?.length) {
          let quote = quotes[0]
          if (args.customerName && !args.quoteId) {
            const search = (args.customerName as string).toLowerCase()
            quote = quotes.find((q: any) =>
              q.customer_name?.toLowerCase().includes(search) ||
              q.lead?.name?.toLowerCase().includes(search)
            ) || quote
          }

          quoteId = quote.id
          customerName = quote.customer_name || quote.lead?.name || 'Unknown'
          customerEmail = quote.customer_email || quote.lead?.email
          shareToken = quote.share_token || undefined
          amountCents = typeof amountOverride === 'number'
            ? Math.round(amountOverride * 100)
            : (quote.total_inc_gst ? Math.round(quote.total_inc_gst * 100) : null)
        }
      }

      if (!amountCents) {
        return { preview: {}, error: 'Amount is required (or specify a customer with a quote/booking)' }
      }

      return {
        preview: {
          action: 'Create payment link',
          customer: customerName,
          jobDate: jobDateLabel,
          amount: formatAmountCents(amountCents) + ' AUD',
          description: description || 'Payment for cleaning services',
          _quoteId: quoteId,
          _occurrenceId: occurrenceId,
          _amountCents: amountCents,
          _customerEmail: customerEmail,
          _shareToken: shareToken,
          _description: description
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
      const normalizedNewPhone = args.newPhone
        ? (normalizePhoneToE164AU(args.newPhone) || (args.newPhone as string))
        : undefined
      if (args.newPhone) changes.push(`Phone: ${lead.phone_number || 'none'} â†’ ${normalizedNewPhone}`)
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
          _newPhone: normalizedNewPhone,
          _newEmail: args.newEmail,
          _newAddress: args.newAddress,
          _newNotes: args.newNotes,
          _appendNotes: args.appendNotes,
          _currentNotes: lead.region_notes
        }
      }
    }

        case 'edit_quote': {
      let quoteQuery = supabaseAdmin
        .from('quotes')
        .select(`
          id,
          quote_number,
          customer_name,
          customer_email,
          customer_phone,
          total_inc_gst,
          service,
          bedrooms,
          bathrooms,
          addons,
          custom_addons,
          discount_percentage,
          deposit_percentage,
          hourly_rate,
          cleaner_rate,
          cleaner_rate_type,
          address,
          address_lat,
          address_lng,
          notes,
          description,
          lead_id,
          lead:extracted_leads(name)
        `)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20)

      let quoteId = args.quoteId as string | undefined
      if (quoteId) {
        quoteQuery = quoteQuery.eq('id', quoteId)
      }

      const { data: quotes } = await quoteQuery

      if (!quotes || quotes.length === 0) {
        return { preview: {}, error: 'No quote found' }
      }

      let quote = quotes[0]
      if (!quoteId && args.customerName) {
        const search = (args.customerName as string).toLowerCase()
        quote = quotes.find((q: any) =>
          q.customer_name?.toLowerCase().includes(search) ||
          q.lead?.name?.toLowerCase().includes(search)
        ) || quote
      }

      if (!quote) {
        return { preview: {}, error: 'Could not find quote' }
      }

      const hasChanges =
        args.service !== undefined ||
        args.bedrooms !== undefined ||
        args.bathrooms !== undefined ||
        args.setAddons !== undefined ||
        args.addAddons !== undefined ||
        args.removeAddons !== undefined ||
        args.customAddons !== undefined ||
        args.newDiscountPercentage !== undefined ||
        args.newDepositPercentage !== undefined ||
        args.newHourlyRate !== undefined ||
        args.newCleanerRate !== undefined ||
        args.newCleanerRateType !== undefined ||
        args.newAddress !== undefined ||
        args.newAddressLat !== undefined ||
        args.newAddressLng !== undefined ||
        args.newNotes !== undefined ||
        args.newDescription !== undefined ||
        args.newCustomerName !== undefined ||
        args.newCustomerEmail !== undefined ||
        args.newCustomerPhone !== undefined

      if (!hasChanges) {
        return { preview: {}, error: 'No changes specified' }
      }

      const service = (args.service as ServiceType) || (quote.service as ServiceType)
      const bedrooms = (args.bedrooms as number) ?? quote.bedrooms
      const bathrooms = (args.bathrooms as number) ?? quote.bathrooms

      if (!service || !bedrooms || !bathrooms) {
        return { preview: {}, error: 'Service, bedrooms, and bathrooms are required to recalculate quote' }
      }

      let newAddons = Array.isArray(quote.addons) ? [...quote.addons] : []
      if (args.setAddons) {
        newAddons = [...(args.setAddons as string[])]
      }
      if (args.addAddons) {
        const toAdd = args.addAddons as string[]
        newAddons = [...new Set([...newAddons, ...toAdd])]
      }
      if (args.removeAddons) {
        const toRemove = args.removeAddons as string[]
        newAddons = newAddons.filter((a) => !toRemove.includes(a))
      }

      const customAddons = (args.customAddons as any[]) ?? (quote.custom_addons || [])
      const discountPct = (args.newDiscountPercentage as number) ?? (quote.discount_percentage ?? 0)
      const depositPct = (args.newDepositPercentage as number) ?? (quote.deposit_percentage ?? 0)

      const clientRate =
        (args.newHourlyRate as number) ??
        (quote.hourly_rate as number) ??
        (ctx.org.default_client_hourly_rate as number) ??
        DEFAULT_PRICING.CLIENT_HOURLY_RATE

      const cleanerRate =
        (args.newCleanerRate as number) ??
        (quote.cleaner_rate as number) ??
        (ctx.org.default_cleaner_hourly_rate as number) ??
        DEFAULT_PRICING.CLEANER_HOURLY_RATE

      const cleanerRateType = (args.newCleanerRateType as string) || quote.cleaner_rate_type || 'hour'

      let quoteResult: any
      try {
        quoteResult = calculateQuote({
          service,
          bedrooms,
          bathrooms,
          addons: newAddons,
          customAddons: customAddons || [],
          clientHourlyRate: clientRate,
          cleanerHourlyRate: cleanerRate,
          cleanerRateType: cleanerRateType === 'job' ? 'job' : 'hour',
          discountApplied: discountPct > 0,
          discountPercentage: discountPct,
          depositPercentage: depositPct
        })
      } catch (err) {
        return { preview: {}, error: err instanceof Error ? err.message : 'Failed to recalculate quote' }
      }

      const changes: string[] = []
      if (args.service) changes.push(`Service -> ${service}`)
      if (args.bedrooms !== undefined || args.bathrooms !== undefined) {
        changes.push(`Rooms -> ${bedrooms} bed / ${bathrooms} bath`)
      }
      if (args.setAddons || args.addAddons || args.removeAddons) changes.push('Add-ons updated')
      if (args.customAddons) changes.push('Custom add-ons updated')
      if (args.newDiscountPercentage !== undefined) changes.push(`Discount -> ${discountPct}%`)
      if (args.newDepositPercentage !== undefined) changes.push(`Deposit -> ${depositPct}%`)
      if (args.newHourlyRate !== undefined) changes.push(`Client rate -> $${clientRate}/hr`)
      if (args.newCleanerRate !== undefined) changes.push(`Cleaner rate -> $${cleanerRate}/${cleanerRateType}`)
      if (args.newAddress) changes.push('Address updated')
      if (args.newNotes) changes.push('Notes updated')
      if (args.newDescription) changes.push('Description updated')
      if (args.newCustomerName || args.newCustomerEmail || args.newCustomerPhone) changes.push('Customer details updated')

      const updates: Record<string, unknown> = {
        service,
        bedrooms,
        bathrooms,
        addons: newAddons,
        custom_addons: customAddons || [],
        hourly_rate: clientRate,
        cleaner_rate: cleanerRate,
        cleaner_rate_type: cleanerRateType,
        main_service_hours: quoteResult.mainServiceHours,
        add_on_hours: quoteResult.totalAddOnHours,
        total_hours: quoteResult.totalLaborHours,
        subtotal: quoteResult.subtotal,
        discount_amount: quoteResult.discountAmount,
        discount_percentage: discountPct,
        net_revenue: quoteResult.netRevenue,
        gst: quoteResult.gst,
        total_inc_gst: quoteResult.totalIncGst,
        cleaner_pay: quoteResult.cleanerPay,
        profit: quoteResult.profit,
        margin: quoteResult.profitMarginPct,
        deposit_percentage: depositPct,
        deposit_amount: quoteResult.depositAmount,
        remaining_balance: quoteResult.remainingBalance
      }

      if (args.newAddress !== undefined) updates.address = args.newAddress
      if (args.newAddressLat !== undefined) updates.address_lat = args.newAddressLat
      if (args.newAddressLng !== undefined) updates.address_lng = args.newAddressLng
      if (args.newNotes !== undefined) updates.notes = args.newNotes
      if (args.newDescription !== undefined) updates.description = args.newDescription
      if (args.newCustomerName !== undefined) updates.customer_name = args.newCustomerName
      if (args.newCustomerEmail !== undefined) updates.customer_email = args.newCustomerEmail
      if (args.newCustomerPhone !== undefined) updates.customer_phone = args.newCustomerPhone

      return {
        preview: {
          action: 'Edit quote',
          quoteNumber: quote.quote_number || quote.id.slice(0, 8),
          customer: quote.customer_name || quote.lead?.name || 'Unknown',
          currentTotal: formatCurrencyAUD(quote.total_inc_gst),
          newTotal: formatCurrencyAUD(quoteResult.totalIncGst),
          changes: changes.join('; '),
          _quoteId: quote.id,
          _leadId: quote.lead_id,
          _updates: updates,
          _customerUpdates: {
            name: args.newCustomerName,
            email: args.newCustomerEmail,
            phone_number: args.newCustomerPhone
          }
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
            id, start_at, payment_status, payment_amount_cents,
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
            id, start_at, payment_status, payment_amount_cents,
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
      const amountFromArgs = typeof args.amount === 'number' ? Math.round((args.amount as number) * 100) : null
      const quoteAmountCents = booking.series?.quote?.total_inc_gst
        ? Math.round(booking.series.quote.total_inc_gst * 100)
        : null
      const amountCents = amountFromArgs ?? booking.payment_amount_cents ?? quoteAmountCents
      const paymentMethod = (args.paymentMethod as string) || 'cash'

      return {
        preview: {
          action: 'Record payment',
          customer: booking.series?.lead?.name || 'Unknown',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          amount: amountCents ? formatAmountCents(amountCents) : 'N/A',
          paymentMethod: paymentMethod,
          _occurrenceId: occurrenceId,
          _amountCents: amountCents,
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

    case 'unassign_cleaner': {
      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, cleaner_id, series:booking_series(title, lead:extracted_leads(name)), cleaner:cleaners(full_name)`)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, cleaner_id, series:booking_series(title, lead:extracted_leads(name)), cleaner:cleaners(full_name)`)
          .eq('org_id', orgId)
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
            ) || bookings[0]
          } else {
            booking = bookings[0]
          }
          occurrenceId = booking?.id
        }
      }

      if (!booking || !occurrenceId) {
        return { preview: {}, error: 'Could not find booking' }
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'

      return {
        preview: {
          action: 'Unassign cleaner',
          customer: booking.series?.lead?.name || 'Unknown',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          currentCleaner: booking.cleaner?.full_name || 'Unassigned',
          _occurrenceId: occurrenceId
        }
      }
    }

    case 'update_booking_address': {
      let seriesId = args.seriesId as string | undefined
      let series: any = null

      if (seriesId) {
        const { data } = await supabaseAdmin
          .from('booking_series')
          .select('id, service_address, service_lat, service_lng, lead:extracted_leads(name)')
          .eq('id', seriesId)
          .eq('org_id', orgId)
          .single()
        series = data
      } else if (args.customerName) {
        const { data: seriesList } = await supabaseAdmin
          .from('booking_series')
          .select('id, service_address, service_lat, service_lng, lead:extracted_leads(name)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (seriesList?.length) {
          const search = (args.customerName as string).toLowerCase()
          series = seriesList.find((s: any) =>
            s.lead?.name?.toLowerCase().includes(search)
          ) || seriesList[0]
          seriesId = series.id
        }
      }

      if (!series || !seriesId) {
        return { preview: {}, error: 'Could not find booking series' }
      }

      return {
        preview: {
          action: 'Update booking address',
          customer: series.lead?.name || 'Unknown',
          currentAddress: series.service_address || 'None',
          newAddress: args.address,
          _seriesId: seriesId,
          _address: args.address,
          _lat: args.latitude,
          _lng: args.longitude
        }
      }
    }

    case 'update_booking_series': {
      let seriesId = args.seriesId as string | undefined
      let series: any = null

      if (seriesId) {
        const { data } = await supabaseAdmin
          .from('booking_series')
          .select('id, title, duration_minutes, rrule, until_date, occurrence_count, status, notes, lead:extracted_leads(name)')
          .eq('id', seriesId)
          .eq('org_id', orgId)
          .single()
        series = data
      } else if (args.customerName) {
        const { data: seriesList } = await supabaseAdmin
          .from('booking_series')
          .select('id, title, duration_minutes, rrule, until_date, occurrence_count, status, notes, lead:extracted_leads(name)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (seriesList?.length) {
          const search = (args.customerName as string).toLowerCase()
          series = seriesList.find((s: any) =>
            s.lead?.name?.toLowerCase().includes(search)
          ) || seriesList[0]
          seriesId = series.id
        }
      }

      if (!series || !seriesId) {
        return { preview: {}, error: 'Could not find booking series' }
      }

      const changes: string[] = []
      if (args.title) changes.push(`Title -> ${args.title}`)
      if (args.durationMinutes !== undefined) changes.push(`Duration -> ${args.durationMinutes} mins`)
      if (args.repeatType) changes.push(`Repeat -> ${args.repeatType}`)
      if (args.untilDate) changes.push(`Until -> ${args.untilDate}`)
      if (args.occurrenceCount !== undefined) changes.push(`Occurrences -> ${args.occurrenceCount}`)
      if (args.status) changes.push(`Status -> ${args.status}`)
      if (args.notes) changes.push('Notes updated')
      if (args.timezone) changes.push(`Timezone -> ${args.timezone}`)

      if (changes.length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      const updates: Record<string, unknown> = {}
      if (args.title !== undefined) updates.title = args.title
      if (args.durationMinutes !== undefined) updates.duration_minutes = args.durationMinutes
      if (args.repeatType !== undefined) updates.rrule = repeatTypeToRRule(args.repeatType as string)
      if (args.untilDate !== undefined) updates.until_date = (args.untilDate as string) || null
      if (args.occurrenceCount !== undefined) updates.occurrence_count = args.occurrenceCount || null
      if (args.status !== undefined) updates.status = args.status
      if (args.notes !== undefined) updates.notes = args.notes
      if (args.timezone !== undefined) updates.timezone = args.timezone

      return {
        preview: {
          action: 'Update booking series',
          customer: series.lead?.name || 'Unknown',
          changes: changes.join('; '),
          _seriesId: seriesId,
          _updates: updates
        }
      }
    }

    case 'set_payment_status': {
      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, payment_status, payment_amount_cents, series:booking_series(lead:extracted_leads(name), quote:quotes(total_inc_gst))`)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, payment_status, payment_amount_cents, series:booking_series(lead:extracted_leads(name), quote:quotes(total_inc_gst))`)
          .eq('org_id', orgId)
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
            ) || bookings[0]
          } else {
            booking = bookings[0]
          }
          occurrenceId = booking?.id
        }
      }

      if (!booking || !occurrenceId) {
        return { preview: {}, error: 'Could not find booking' }
      }

      const amountFromArgs = typeof args.amountDollars === 'number'
        ? Math.round((args.amountDollars as number) * 100)
        : null
      const quoteAmountCents = booking.series?.quote?.total_inc_gst
        ? Math.round(booking.series.quote.total_inc_gst * 100)
        : null
      const amountCents = amountFromArgs ?? booking.payment_amount_cents ?? quoteAmountCents

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'

      return {
        preview: {
          action: 'Update payment status',
          customer: booking.series?.lead?.name || 'Unknown',
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          newStatus: args.paymentStatus,
          amount: amountCents ? formatAmountCents(amountCents) : 'N/A',
          _occurrenceId: occurrenceId,
          _paymentStatus: args.paymentStatus,
          _amountCents: amountCents,
          _notes: args.notes
        }
      }
    }

    case 'send_payment_reminder_sms': {
      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, payment_amount_cents, payment_link, series:booking_series(lead:extracted_leads(name, phone_number, email), quote:quotes(share_token, total_inc_gst))`)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, payment_amount_cents, payment_link, series:booking_series(lead:extracted_leads(name, phone_number, email), quote:quotes(share_token, total_inc_gst))`)
          .eq('org_id', orgId)
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
            ) || bookings[0]
          } else {
            booking = bookings[0]
          }
          occurrenceId = booking?.id
        }
      }

      if (!booking || !occurrenceId) {
        return { preview: {}, error: 'Could not find booking' }
      }

      const lead = booking.series?.lead
      let phone = lead?.phone_number
      if (!phone) {
        return { preview: {}, error: 'Customer phone number not found' }
      }

      const paymentLink = booking.payment_link
      if (!paymentLink) {
        return { preview: {}, error: 'Payment link not found. Create a payment link first.' }
      }

      const quoteToken = booking.series?.quote?.share_token
      const quoteLink = quoteToken ? buildQuoteShareUrl(quoteToken) : ''
      const amountCents = booking.payment_amount_cents ??
        (booking.series?.quote?.total_inc_gst ? Math.round(booking.series.quote.total_inc_gst * 100) : null)

      if (!amountCents) {
        return { preview: {}, error: 'Payment amount not found' }
      }

      let message = (args.message as string) || ''
      let templateId: string | null = null
      let templateTitle: string | null = null
      let templateTone: string | null = null

      if (!message) {
        let templateQuery = supabaseAdmin
          .from('payment_sms_templates')
          .select('id, title, body, slug, tone, is_default')
          .eq('org_id', orgId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(10)

        if (args.templateId) {
          templateQuery = templateQuery.eq('id', args.templateId)
        } else if (args.templateSlug) {
          templateQuery = templateQuery.eq('slug', args.templateSlug)
        }

        const { data: templates } = await templateQuery
        const template = templates?.[0]
        if (template?.body) {
          templateId = template.id || null
          templateTitle = template.title || null
          templateTone = template.tone || null
          const amountText = amountCents ? formatAmountCents(amountCents) : 'the agreed amount'
          message = fillTemplate(template.body, {
            name: lead?.name || 'there',
            phone: phone,
            number: phone,
            amount: amountText,
            payment_link: paymentLink,
            stripe_payment_link: paymentLink,
            quote_link: quoteLink
          })
        }
      }

      if (!message) {
        return { preview: {}, error: 'Message or template is required' }
      }

      phone = normalizePhoneToE164AU(phone) || phone

      return {
        preview: {
          action: 'Send payment reminder SMS',
          customer: lead?.name || 'Unknown',
          phone,
          amount: formatAmountCents(amountCents),
          template: templateTitle || (args.templateSlug as string) || null,
          message,
          _occurrenceId: occurrenceId,
          _phone: phone,
          _message: message,
          _templateId: templateId,
          _templateTone: templateTone,
          _amountCents: amountCents
        }
      }
    }

    case 'send_review_reminder_sms': {
      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, series:booking_series(lead:extracted_leads(name, phone_number))`)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, series:booking_series(lead:extracted_leads(name, phone_number))`)
          .eq('org_id', orgId)
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
            ) || bookings[0]
          } else {
            booking = bookings[0]
          }
          occurrenceId = booking?.id
        }
      }

      if (!booking || !occurrenceId) {
        return { preview: {}, error: 'Could not find booking' }
      }

      const lead = booking.series?.lead
      let phone = lead?.phone_number
      if (!phone) {
        return { preview: {}, error: 'Customer phone number not found' }
      }

      const reviewLink = (args.reviewLink as string) || getReviewLink()

      let message = (args.message as string) || ''
      let templateId: string | null = null
      let templateTitle: string | null = null
      let templateTone: string | null = null

      if (!message) {
        let templateQuery = supabaseAdmin
          .from('review_sms_templates')
          .select('id, title, body, slug, tone, is_default')
          .eq('org_id', orgId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(10)

        if (args.templateId) {
          templateQuery = templateQuery.eq('id', args.templateId)
        } else if (args.templateSlug) {
          templateQuery = templateQuery.eq('slug', args.templateSlug)
        }

        const { data: templates } = await templateQuery
        const template = templates?.[0]
        if (template?.body) {
          templateId = template.id || null
          templateTitle = template.title || null
          templateTone = template.tone || null
          message = fillTemplate(template.body, {
            name: lead?.name || 'there',
            review_link: reviewLink
          })
        }
      }

      if (!message) {
        return { preview: {}, error: 'Message or template is required' }
      }

      phone = normalizePhoneToE164AU(phone) || phone

      return {
        preview: {
          action: 'Send review reminder SMS',
          customer: lead?.name || 'Unknown',
          phone,
          template: templateTitle || (args.templateSlug as string) || null,
          message,
          reviewLink,
          _occurrenceId: occurrenceId,
          _phone: phone,
          _message: message,
          _templateId: templateId,
          _templateTone: templateTone
        }
      }
    }

    case 'resume_marketing_loop':
    case 'send_marketing_now':
    case 'set_marketing_step': {
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

      const journeyType = (args.journeyType as string) || (toolName === 'send_marketing_now' ? 'sms' : 'both')
      const step = args.step as number | undefined

      if (toolName === 'set_marketing_step' && (step === undefined || step === null)) {
        return { preview: {}, error: 'Step number is required' }
      }

      return {
        preview: {
          action: toolName === 'resume_marketing_loop'
            ? 'Resume marketing loop'
            : toolName === 'send_marketing_now'
              ? 'Send marketing now'
              : 'Set marketing step',
          customer: customerName,
          journeyType,
          step,
          _leadId: leadId,
          _journeyType: journeyType,
          _step: step
        }
      }
    }

    case 'reschedule_booking': {
      const newDateTime = args.newDateTime as string | undefined
      if (!newDateTime) {
        return { preview: {}, error: 'New date/time is required' }
      }

      let occurrenceId = args.occurrenceId as string | undefined
      let booking: any = null

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, end_at, series:booking_series(title, duration_minutes, lead:extracted_leads(name))`)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else {
        let query = supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, end_at, series:booking_series(title, duration_minutes, lead:extracted_leads(name))`)
          .eq('org_id', orgId)
          .order('start_at', { ascending: false })
          .limit(10)

        if (args.currentDate) {
          query = query.gte('start_at', args.currentDate + 'T00:00:00').lte('start_at', args.currentDate + 'T23:59:59')
        }

        const { data: bookings } = await query
        if (bookings?.length) {
          if (args.customerName) {
            const search = (args.customerName as string).toLowerCase()
            booking = bookings.find((b: any) =>
              b.series?.lead?.name?.toLowerCase().includes(search)
            ) || bookings[0]
          } else {
            booking = bookings[0]
          }
          occurrenceId = booking?.id
        }
      }

      if (!booking || !occurrenceId) {
        return { preview: {}, error: 'Could not find booking' }
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'
      const oldStart = new Date(booking.start_at)
      const oldDate = oldStart.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone })
      const oldTime = oldStart.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })

      const newStart = new Date(newDateTime)
      const newDate = newStart.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone })
      const newTime = newStart.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })

      const durationMs = booking.end_at
        ? new Date(booking.end_at).getTime() - new Date(booking.start_at).getTime()
        : ((booking.series?.duration_minutes as number) || 120) * 60 * 1000

      return {
        preview: {
          action: 'Reschedule booking',
          customer: booking.series?.lead?.name || 'Unknown',
          jobTitle: booking.series?.title || 'Cleaning',
          oldDate,
          oldTime,
          newDate,
          newTime,
          _occurrenceId: occurrenceId,
          _newDateTime: newDateTime,
          _durationMs: durationMs
        }
      }
    }

    case 'extract_lead_info': {
      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'
      let emailId = args.emailId as string | undefined
      let emailRow: any = null

      if (emailId) {
        const { data } = await supabaseAdmin
          .from('dialpad_emails')
          .select('id, subject, from_email, created_at')
          .eq('org_id', orgId)
          .eq('id', emailId)
          .maybeSingle()
        emailRow = data
      } else {
        let query = supabaseAdmin
          .from('dialpad_emails')
          .select('id, subject, from_email, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (args.fromEmail) {
          query = query.ilike('from_email', `%${args.fromEmail}%`)
        }
        if (args.subjectContains) {
          query = query.ilike('subject', `%${args.subjectContains}%`)
        }

        const { data: emails } = await query
        if (emails && emails.length > 0) {
          emailRow = emails[0]
          emailId = emailRow.id
        }
      }

      if (!emailRow || !emailId) {
        return { preview: {}, error: 'No matching email found' }
      }

      return {
        preview: {
          action: 'Extract lead info from email',
          emailId,
          from: emailRow.from_email || 'Unknown',
          subject: emailRow.subject || 'No subject',
          receivedAt: emailRow.created_at
            ? new Date(emailRow.created_at).toLocaleString('en-AU', { timeZone: timezone })
            : null,
          _emailId: emailId
        }
      }
    }

    case 'delete_lead': {
      let leadQuery = supabaseAdmin
        .from('extracted_leads')
        .select('id, name, email, phone_number, status')
        .eq('org_id', orgId)
        .limit(20)

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

      const { count: quotesCount } = await supabaseAdmin
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('lead_id', lead.id)

      const { count: seriesCount } = await supabaseAdmin
        .from('booking_series')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('lead_id', lead.id)

      return {
        preview: {
          action: 'Delete lead',
          customer: lead.name || 'Unknown',
          email: lead.email,
          phone: lead.phone_number,
          status: lead.status || 'No status',
          relatedQuotes: quotesCount || 0,
          relatedBookings: seriesCount || 0,
          _leadId: lead.id
        }
      }
    }

    case 'send_lead_sms': {
      let leadQuery = supabaseAdmin
        .from('extracted_leads')
        .select('id, name, phone_number')
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
      let phone = (args.phoneNumber as string) || lead.phone_number
      if (!phone) {
        return { preview: {}, error: 'Lead has no phone number' }
      }

      let message = (args.message as string) || ''
      let templateTitle: string | null = null

      if (!message) {
        let templateQuery = supabaseAdmin
          .from('sms_templates')
          .select('id, title, body, slug, is_default')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(10)

        if (args.templateId) {
          templateQuery = templateQuery.eq('id', args.templateId)
        } else if (args.templateSlug) {
          templateQuery = templateQuery.eq('slug', args.templateSlug)
        }

        const { data: templates } = await templateQuery
        const template = templates?.[0]
        if (template?.body) {
          templateTitle = template.title || null
          message = fillTemplate(template.body, {
            name: lead.name || 'there'
          })
        }
      }

      if (!message) {
        return { preview: {}, error: 'Message or template is required' }
      }

      phone = normalizePhoneToE164AU(phone) || phone

      return {
        preview: {
          action: 'Send lead SMS',
          customer: lead.name || 'Unknown',
          phone,
          template: templateTitle || (args.templateSlug as string) || null,
          message,
          _phone: phone,
          _leadId: lead.id,
          _message: message
        }
      }
    }

    case 'send_quote_sms': {
      let quoteQuery = supabaseAdmin
        .from('quotes')
        .select('id, quote_number, customer_name, customer_phone, total_inc_gst, gst, service, bedrooms, bathrooms, addons, custom_addons, address, share_token, lead_id, lead:extracted_leads(name, phone_number)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (args.quoteId) {
        quoteQuery = quoteQuery.eq('id', args.quoteId)
      }

      const { data: quotes } = await quoteQuery

      if (!quotes || quotes.length === 0) {
        return { preview: {}, error: 'No quote found' }
      }

      let quote = quotes[0]
      if (args.customerName && !args.quoteId) {
        const search = (args.customerName as string).toLowerCase()
        quote = quotes.find((q: any) =>
          q.customer_name?.toLowerCase().includes(search) ||
          q.lead?.name?.toLowerCase().includes(search)
        ) || quote
      }

      let phone = (args.phoneNumber as string) || quote.customer_phone || quote.lead?.phone_number
      if (!phone) {
        return { preview: {}, error: 'Customer phone number not found' }
      }

      const shareUrl = quote.share_token ? buildQuoteShareUrl(quote.share_token) : null

      const humanizeAddonKey = (value: string) => {
        const mapped = ADDON_DISPLAY_NAMES[value]
        if (mapped) return mapped
        return value
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, (char) => char.toUpperCase())
      }

      const formatAddons = (addons?: string[] | null, customAddons?: any[] | null) => {
        const parts: string[] = []
        if (Array.isArray(addons)) {
          addons.forEach((item) => {
            if (typeof item === 'string' && item.trim() !== '') {
              parts.push(humanizeAddonKey(item.trim()))
            }
          })
        }
        if (Array.isArray(customAddons)) {
          customAddons.forEach((addon) => {
            if (addon?.name && addon.name.trim() !== '') {
              parts.push(addon.name.trim())
            }
          })
        }
        return parts.join(', ')
      }

      let message = (args.message as string) || ''
      if (!message) {
        const customerLabel = quote.customer_name || quote.lead?.name || 'there'
        const addressLabel = quote.address || ''
        const serviceLabel = `${quote.service || 'Cleaning'} clean`
        const roomsLabel = `${quote.bedrooms || 0} bedroom, ${quote.bathrooms || 0} bathroom`
        const addonsLabel = formatAddons(quote.addons, quote.custom_addons)
        const gstLabel = formatCurrencyAUD(quote.gst)
        const totalLabel = formatCurrencyAUD(quote.total_inc_gst)
        const addonsLine = addonsLabel ? `Add-ons: ${addonsLabel}` : ''
        const addressLine = addressLabel ? `Here is your quote for ${addressLabel}.` : 'Here is your quote.'

        message = [
          `Hey ${customerLabel},`,
          addressLine,
          `${serviceLabel} - ${roomsLabel}.`,
          addonsLine,
          '',
          'Price breakdown',
          `GST: ${gstLabel}`,
          `Total: ${totalLabel}`,
          '',
          'Here is the link to the full quote + payment details:',
          shareUrl || '',
          '',
          'Thanks, get back to me ASAP so I can book you in.'
        ]
          .filter((line) => line.trim() !== '')
          .join('\n')
      }

      phone = normalizePhoneToE164AU(phone) || phone

      return {
        preview: {
          action: 'Send quote SMS',
          customer: quote.customer_name || quote.lead?.name || 'Unknown',
          phone,
          quoteNumber: quote.quote_number || quote.id.slice(0, 8),
          shareUrl,
          message,
          _phone: phone,
          _quoteId: quote.id,
          _leadId: quote.lead_id,
          _message: message
        }
      }
    }

    case 'delete_quote': {
      let quoteQuery = supabaseAdmin
        .from('quotes')
        .select('id, quote_number, customer_name, total_inc_gst, lead:extracted_leads(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (args.quoteId) {
        quoteQuery = quoteQuery.eq('id', args.quoteId)
      } else if (args.quoteNumber) {
        quoteQuery = quoteQuery.eq('quote_number', args.quoteNumber)
      }

      const { data: quotes } = await quoteQuery

      if (!quotes || quotes.length === 0) {
        return { preview: {}, error: 'No quote found' }
      }

      let quote = quotes[0]
      if (args.customerName && !args.quoteId && !args.quoteNumber) {
        const search = (args.customerName as string).toLowerCase()
        quote = quotes.find((q: any) =>
          q.customer_name?.toLowerCase().includes(search) ||
          q.lead?.name?.toLowerCase().includes(search)
        ) || quote
      }

      return {
        preview: {
          action: 'Delete quote',
          quoteNumber: quote.quote_number || quote.id.slice(0, 8),
          customer: quote.customer_name || quote.lead?.name || 'Unknown',
          total: formatCurrencyAUD(quote.total_inc_gst),
          _quoteId: quote.id
        }
      }
    }

    case 'create_cleaner': {
      const fullName = args.fullName as string
      if (!fullName) {
        return { preview: {}, error: 'Cleaner name is required' }
      }

      const phoneRaw = args.phone as string | undefined
      const phone = phoneRaw ? (normalizePhoneToE164AU(phoneRaw) || phoneRaw) : undefined

      return {
        preview: {
          action: 'Create cleaner',
          name: fullName,
          phone: phone || 'Not provided',
          email: args.email || 'Not provided',
          active: args.active !== undefined ? Boolean(args.active) : true,
          _phone: phone
        }
      }
    }

    case 'update_cleaner': {
      let cleanerId = args.cleanerId as string | undefined
      let cleaner: any = null

      if (cleanerId) {
        const { data } = await supabaseAdmin
          .from('cleaners')
          .select('id, full_name, phone, email, active')
          .eq('id', cleanerId)
          .eq('org_id', orgId)
          .single()
        cleaner = data
      } else if (args.cleanerName) {
        const { data: cleaners } = await supabaseAdmin
          .from('cleaners')
          .select('id, full_name, phone, email, active')
          .eq('org_id', orgId)
          .ilike('full_name', `%${args.cleanerName}%`)
          .limit(1)
        if (cleaners?.length) {
          cleaner = cleaners[0]
          cleanerId = cleaner.id
        }
      }

      if (!cleaner || !cleanerId) {
        return { preview: {}, error: 'Cleaner not found' }
      }

      const changes: string[] = []
      const updates: Record<string, unknown> = {}

      if (args.fullName !== undefined) {
        updates.full_name = args.fullName
        changes.push(`Name -> ${args.fullName}`)
      }
      if (args.phone !== undefined) {
        const normalized = normalizePhoneToE164AU(args.phone) || args.phone
        updates.phone = normalized
        changes.push(`Phone -> ${normalized}`)
      }
      if (args.email !== undefined) {
        updates.email = args.email
        changes.push(`Email -> ${args.email}`)
      }
      if (args.baseLocationText !== undefined) {
        updates.base_location_text = args.baseLocationText
        changes.push('Base location updated')
      }
      if (args.baseLat !== undefined) updates.base_lat = args.baseLat
      if (args.baseLng !== undefined) updates.base_lng = args.baseLng
      if (args.abn !== undefined) updates.abn = args.abn
      if (args.bankAccountName !== undefined) updates.bank_account_name = args.bankAccountName
      if (args.bankBsb !== undefined) updates.bank_bsb = args.bankBsb
      if (args.bankAccountNumber !== undefined) updates.bank_account_number = args.bankAccountNumber
      if (args.minBookingMinutes !== undefined) updates.min_booking_minutes = args.minBookingMinutes
      if (args.noticeHours !== undefined) updates.notice_hours = args.noticeHours
      if (args.cancellationPolicy !== undefined) updates.cancellation_policy = args.cancellationPolicy
      if (args.hasTransport !== undefined) updates.has_transport = args.hasTransport
      if (args.transportType !== undefined) updates.transport_type = args.transportType
      if (args.maxTravelKm !== undefined) updates.max_travel_km = args.maxTravelKm
      if (args.canTransportEquipment !== undefined) updates.can_transport_equipment = args.canTransportEquipment
      if (args.publicLiabilityPolicyNumber !== undefined) updates.public_liability_policy_number = args.publicLiabilityPolicyNumber
      if (args.publicLiabilityExpiry !== undefined) updates.public_liability_expiry = args.publicLiabilityExpiry
      if (args.teamSize !== undefined) updates.team_size = args.teamSize
      if (args.rates !== undefined) updates.rates = args.rates
      if (args.availability !== undefined) updates.availability = args.availability
      if (args.active !== undefined) {
        updates.active = args.active
        changes.push(`Active -> ${args.active ? 'Yes' : 'No'}`)
      }

      if (Object.keys(updates).length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Update cleaner',
          cleaner: cleaner.full_name || 'Cleaner',
          changes: changes.join('; '),
          _cleanerId: cleanerId,
          _updates: updates
        }
      }
    }

    case 'delete_cleaner': {
      let cleanerId = args.cleanerId as string | undefined
      let cleaner: any = null

      if (cleanerId) {
        const { data } = await supabaseAdmin
          .from('cleaners')
          .select('id, full_name, phone, email')
          .eq('id', cleanerId)
          .eq('org_id', orgId)
          .single()
        cleaner = data
      } else if (args.cleanerName) {
        const { data: cleaners } = await supabaseAdmin
          .from('cleaners')
          .select('id, full_name, phone, email')
          .eq('org_id', orgId)
          .ilike('full_name', `%${args.cleanerName}%`)
          .limit(1)
        if (cleaners?.length) {
          cleaner = cleaners[0]
          cleanerId = cleaner.id
        }
      }

      if (!cleaner || !cleanerId) {
        return { preview: {}, error: 'Cleaner not found' }
      }

      return {
        preview: {
          action: 'Delete cleaner',
          cleaner: cleaner.full_name || 'Cleaner',
          phone: cleaner.phone || 'N/A',
          email: cleaner.email || 'N/A',
          _cleanerId: cleanerId
        }
      }
    }

    case 'create_cleaner_review': {
      let occurrenceId = args.occurrenceId as string | undefined
      let cleanerId = args.cleanerId as string | undefined
      let booking: any = null
      let cleaner: any = null

      if (args.cleanerName && !cleanerId) {
        const { data: cleaners } = await supabaseAdmin
          .from('cleaners')
          .select('id, full_name')
          .eq('org_id', orgId)
          .ilike('full_name', `%${args.cleanerName}%`)
          .limit(1)
        if (cleaners?.length) {
          cleaner = cleaners[0]
          cleanerId = cleaner.id
        }
      }

      if (occurrenceId) {
        const { data } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, status, cleaner_id, series:booking_series(title, lead:extracted_leads(name)), cleaner:cleaners(id, full_name)`)
          .eq('id', occurrenceId)
          .eq('org_id', orgId)
          .single()
        booking = data
      } else if (cleanerId) {
        const { data: bookings } = await supabaseAdmin
          .from('booking_occurrences')
          .select(`id, start_at, status, cleaner_id, series:booking_series(title, lead:extracted_leads(name)), cleaner:cleaners(id, full_name)`)
          .eq('org_id', orgId)
          .eq('status', 'completed')
          .eq('cleaner_id', cleanerId)
          .order('start_at', { ascending: false })
          .limit(1)
        if (bookings?.length) {
          booking = bookings[0]
          occurrenceId = booking.id
        }
      }

      if (!booking || !occurrenceId) {
        return { preview: {}, error: 'Completed booking not found for review' }
      }

      cleanerId = cleanerId || booking.cleaner_id || booking.cleaner?.id
      const cleanerName = cleaner?.full_name || booking.cleaner?.full_name || 'Cleaner'

      if (!cleanerId) {
        return { preview: {}, error: 'Cleaner not found for this booking' }
      }

      const rating = args.rating as number
      if (!rating || rating < 1 || rating > 5) {
        return { preview: {}, error: 'Rating must be between 1 and 5' }
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'

      return {
        preview: {
          action: 'Create cleaner review',
          customer: booking.series?.lead?.name || 'Unknown',
          cleaner: cleanerName,
          jobDate: new Date(booking.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }),
          rating,
          notes: args.notes || 'None',
          _occurrenceId: occurrenceId,
          _cleanerId: cleanerId,
          _rating: rating,
          _notes: args.notes
        }
      }
    }

    case 'update_cleaner_payout': {
      let payoutId = args.payoutId as string | undefined
      let payout: any = null

      if (payoutId) {
        const { data } = await supabaseAdmin
          .from('cleaner_payouts')
          .select(`id, payout_amount, notes, paid_at, occurrence_id, cleaner:cleaners(full_name), occurrence:booking_occurrences(start_at, series:booking_series(title, lead:extracted_leads(name)))`)
          .eq('id', payoutId)
          .eq('org_id', orgId)
          .single()
        payout = data
      } else if (args.occurrenceId) {
        const { data } = await supabaseAdmin
          .from('cleaner_payouts')
          .select(`id, payout_amount, notes, paid_at, occurrence_id, cleaner:cleaners(full_name), occurrence:booking_occurrences(start_at, series:booking_series(title, lead:extracted_leads(name)))`)
          .eq('occurrence_id', args.occurrenceId)
          .eq('org_id', orgId)
          .maybeSingle()
        payout = data
        payoutId = payout?.id
      }

      if (!payout || !payoutId) {
        return { preview: {}, error: 'Payout record not found' }
      }

      const changes: string[] = []
      const updates: Record<string, unknown> = {}
      if (args.payoutAmount !== undefined) {
        updates.payout_amount = args.payoutAmount
        changes.push(`Payout -> $${Number(args.payoutAmount).toFixed(2)}`)
      }
      if (args.notes !== undefined) {
        updates.notes = args.notes
        changes.push('Notes updated')
      }

      if (Object.keys(updates).length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'
      const jobDate = payout.occurrence?.start_at
        ? new Date(payout.occurrence.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone })
        : 'Unknown'

      return {
        preview: {
          action: 'Update cleaner payout',
          cleaner: payout.cleaner?.full_name || 'Cleaner',
          customer: payout.occurrence?.series?.lead?.name || 'Unknown',
          jobDate,
          changes: changes.join('; '),
          _payoutId: payoutId,
          _updates: updates
        }
      }
    }

    case 'mark_cleaner_payout_paid': {
      let payoutId = args.payoutId as string | undefined
      let payout: any = null

      if (payoutId) {
        const { data } = await supabaseAdmin
          .from('cleaner_payouts')
          .select(`id, paid_at, occurrence_id, cleaner:cleaners(full_name), occurrence:booking_occurrences(start_at, series:booking_series(lead:extracted_leads(name)))`)
          .eq('id', payoutId)
          .eq('org_id', orgId)
          .single()
        payout = data
      } else if (args.occurrenceId) {
        const { data } = await supabaseAdmin
          .from('cleaner_payouts')
          .select(`id, paid_at, occurrence_id, cleaner:cleaners(full_name), occurrence:booking_occurrences(start_at, series:booking_series(lead:extracted_leads(name)))`)
          .eq('occurrence_id', args.occurrenceId)
          .eq('org_id', orgId)
          .maybeSingle()
        payout = data
        payoutId = payout?.id
      }

      if (!payout || !payoutId) {
        return { preview: {}, error: 'Payout record not found' }
      }

      const markPaid = args.markPaid !== undefined ? Boolean(args.markPaid) : true
      const timezone = (ctx.org.timezone as string) || 'Australia/Sydney'
      const jobDate = payout.occurrence?.start_at
        ? new Date(payout.occurrence.start_at).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone })
        : 'Unknown'

      return {
        preview: {
          action: markPaid ? 'Mark payout paid' : 'Mark payout unpaid',
          cleaner: payout.cleaner?.full_name || 'Cleaner',
          customer: payout.occurrence?.series?.lead?.name || 'Unknown',
          jobDate,
          currentStatus: payout.paid_at ? 'Paid' : 'Unpaid',
          _payoutId: payoutId,
          _markPaid: markPaid
        }
      }
    }

    case 'create_todo': {
      const title = args.title as string
      if (!title) {
        return { preview: {}, error: 'Todo title is required' }
      }

      return {
        preview: {
          action: 'Create todo',
          title,
          description: args.description || 'None',
          dueDate: args.dueDate || 'Not set',
          rollOver: args.rollOver !== undefined ? Boolean(args.rollOver) : true
        }
      }
    }

    case 'update_todo': {
      const todoId = args.todoId as string
      if (!todoId) {
        return { preview: {}, error: 'Todo ID is required' }
      }

      const { data: todo } = await supabaseAdmin
        .from('todos')
        .select('id, title, description, is_completed, due_date')
        .eq('id', todoId)
        .eq('org_id', orgId)
        .single()

      if (!todo) {
        return { preview: {}, error: 'Todo not found' }
      }

      const changes: string[] = []
      const updates: Record<string, unknown> = {}
      if (args.title !== undefined) {
        updates.title = args.title
        changes.push(`Title -> ${args.title}`)
      }
      if (args.description !== undefined) {
        updates.description = args.description
        changes.push('Description updated')
      }
      if (args.isCompleted !== undefined) {
        updates.is_completed = args.isCompleted
        changes.push(args.isCompleted ? 'Mark complete' : 'Mark incomplete')
      }
      if (args.dueDate !== undefined) {
        updates.due_date = args.dueDate
        changes.push(`Due date -> ${args.dueDate || 'None'}`)
      }

      if (Object.keys(updates).length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Update todo',
          title: todo.title,
          changes: changes.join('; '),
          _todoId: todoId,
          _updates: updates
        }
      }
    }

    case 'delete_todo': {
      const todoId = args.todoId as string
      if (!todoId) {
        return { preview: {}, error: 'Todo ID is required' }
      }

      const { data: todo } = await supabaseAdmin
        .from('todos')
        .select('id, title, description')
        .eq('id', todoId)
        .eq('org_id', orgId)
        .single()

      if (!todo) {
        return { preview: {}, error: 'Todo not found' }
      }

      return {
        preview: {
          action: 'Delete todo',
          title: todo.title,
          description: todo.description || 'None',
          _todoId: todoId
        }
      }
    }

    case 'send_team_invite': {
      const email = (args.email as string | undefined)?.trim()
      if (!email) {
        return { preview: {}, error: 'Email is required' }
      }
      const role = (args.role as string) || 'staff'

      return {
        preview: {
          action: 'Send team invite',
          email,
          role
        }
      }
    }

    case 'update_member_role': {
      let memberId = args.memberId as string | undefined
      let member: any = null

      if (!memberId && args.email) {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
        const matchedUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === (args.email as string).toLowerCase()
        )
        if (matchedUser) {
          const { data } = await supabaseAdmin
            .from('organization_members')
            .select('id, role, display_name')
            .eq('org_id', orgId)
            .eq('user_id', matchedUser.id)
            .maybeSingle()
          member = data
          memberId = data?.id
        }
      } else if (memberId) {
        const { data } = await supabaseAdmin
          .from('organization_members')
          .select('id, role, display_name')
          .eq('org_id', orgId)
          .eq('id', memberId)
          .maybeSingle()
        member = data
      }

      if (!member || !memberId) {
        return { preview: {}, error: 'Member not found' }
      }

      const newRole = args.role as string
      if (!newRole) {
        return { preview: {}, error: 'Role is required' }
      }

      return {
        preview: {
          action: 'Update member role',
          member: member.display_name || args.email || memberId,
          currentRole: member.role || 'unknown',
          newRole,
          _memberId: memberId,
          _role: newRole
        }
      }
    }

    case 'remove_member': {
      let memberId = args.memberId as string | undefined
      let member: any = null

      if (!memberId && args.email) {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
        const matchedUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === (args.email as string).toLowerCase()
        )
        if (matchedUser) {
          const { data } = await supabaseAdmin
            .from('organization_members')
            .select('id, role, display_name')
            .eq('org_id', orgId)
            .eq('user_id', matchedUser.id)
            .maybeSingle()
          member = data
          memberId = data?.id
        }
      } else if (memberId) {
        const { data } = await supabaseAdmin
          .from('organization_members')
          .select('id, role, display_name')
          .eq('org_id', orgId)
          .eq('id', memberId)
          .maybeSingle()
        member = data
      }

      if (!member || !memberId) {
        return { preview: {}, error: 'Member not found' }
      }

      return {
        preview: {
          action: 'Remove member',
          member: member.display_name || args.email || memberId,
          role: member.role || 'unknown',
          _memberId: memberId
        }
      }
    }

    case 'revoke_invite': {
      let inviteId = args.inviteId as string | undefined
      let invite: any = null

      if (inviteId) {
        const { data } = await supabaseAdmin
          .from('organization_invites')
          .select('id, email, role, expires_at')
          .eq('org_id', orgId)
          .eq('id', inviteId)
          .maybeSingle()
        invite = data
      } else if (args.email) {
        const { data } = await supabaseAdmin
          .from('organization_invites')
          .select('id, email, role, expires_at')
          .eq('org_id', orgId)
          .eq('email', args.email)
          .is('accepted_at', null)
          .maybeSingle()
        invite = data
        inviteId = data?.id
      }

      if (!invite || !inviteId) {
        return { preview: {}, error: 'Invite not found' }
      }

      return {
        preview: {
          action: 'Revoke invite',
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expires_at,
          _inviteId: inviteId
        }
      }
    }

    case 'update_integration': {
      const provider = args.provider as string
      if (!provider) {
        return { preview: {}, error: 'Provider is required' }
      }

      const { data: existing } = await supabaseAdmin
        .from('organization_integrations')
        .select('id, enabled, config')
        .eq('org_id', orgId)
        .eq('provider', provider)
        .maybeSingle()

      const enabled = args.enabled !== undefined ? Boolean(args.enabled) : existing?.enabled
      const config = args.config !== undefined ? args.config : existing?.config
      const configKeys = config && typeof config === 'object' ? Object.keys(config as Record<string, unknown>) : []

      return {
        preview: {
          action: 'Update integration',
          provider,
          enabled: enabled === undefined ? 'Unchanged' : enabled ? 'Enabled' : 'Disabled',
          configKeys: configKeys.length ? configKeys.join(', ') : 'None',
          _provider: provider,
          _enabled: args.enabled,
          _config: args.config
        }
      }
    }

    case 'update_org_settings': {
      const updates: Record<string, unknown> = {}
      const changes: string[] = []

      if (args.businessName !== undefined) {
        updates.business_name = args.businessName
        changes.push(`Business name -> ${args.businessName}`)
      }
      if (args.abn !== undefined) {
        updates.business_abn = args.abn
        changes.push('ABN updated')
      }
      if (args.phone !== undefined) {
        updates.business_phone = args.phone
        changes.push('Phone updated')
      }
      if (args.email !== undefined) {
        updates.business_email = args.email
        changes.push('Email updated')
      }
      if (args.operatingName !== undefined) {
        updates.business_operating_name = args.operatingName
        changes.push('Operating name updated')
      }
      if (args.timezone !== undefined) {
        updates.timezone = args.timezone
        changes.push(`Timezone -> ${args.timezone}`)
      }
      if (args.clientRate !== undefined) {
        updates.default_client_hourly_rate = args.clientRate
        changes.push(`Client rate -> ${args.clientRate}`)
      }
      if (args.cleanerRate !== undefined) {
        updates.default_cleaner_hourly_rate = args.cleanerRate
        changes.push(`Cleaner rate -> ${args.cleanerRate}`)
      }
      if (args.gstRate !== undefined) {
        updates.gst_rate = args.gstRate
        changes.push(`GST rate -> ${args.gstRate}`)
      }
      if (args.discountPct !== undefined) {
        updates.default_discount_pct = args.discountPct
        changes.push(`Discount -> ${args.discountPct}`)
      }
      if (args.depositPct !== undefined) {
        updates.default_deposit_pct = args.depositPct
        changes.push(`Deposit -> ${args.depositPct}`)
      }
      if (args.logoUrl !== undefined) {
        updates.logo_url = args.logoUrl
        changes.push('Logo updated')
      }
      if (args.primaryColor !== undefined) {
        updates.primary_color = args.primaryColor
        changes.push('Primary color updated')
      }

      if (Object.keys(updates).length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Update organization settings',
          changes: changes.join('; '),
          _updates: updates
        }
      }
    }

    case 'update_automation_setting': {
      const automationType = args.automationType as string
      if (!automationType) {
        return { preview: {}, error: 'Automation type is required' }
      }

      return {
        preview: {
          action: 'Update automation setting',
          automationType,
          enabled: args.enabled !== undefined ? (args.enabled ? 'Enabled' : 'Disabled') : 'Unchanged',
          configKeys: args.config && typeof args.config === 'object'
            ? Object.keys(args.config as Record<string, unknown>).join(', ')
            : 'None',
          _automationType: automationType,
          _enabled: args.enabled,
          _config: args.config
        }
      }
    }

    case 'update_template': {
      const templateType = args.templateType as string
      const templateId = args.templateId as string
      if (!templateType || !templateId) {
        return { preview: {}, error: 'Template type and ID are required' }
      }

      const table = templateType === 'marketing_sms'
        ? 'marketing_sms_templates'
        : templateType === 'marketing_email'
          ? 'marketing_email_templates'
          : templateType === 'payment_sms'
            ? 'payment_sms_templates'
            : 'review_sms_templates'

      const { data: template } = await supabaseAdmin
        .from(table)
        .select('id, title, subject, body')
        .eq('org_id', orgId)
        .eq('id', templateId)
        .maybeSingle()

      const updates: Record<string, unknown> = {}
      const changes: string[] = []
      if (args.title !== undefined) {
        updates.title = args.title
        changes.push('Title updated')
      }
      if (args.subject !== undefined) {
        updates.subject = args.subject
        changes.push('Subject updated')
      }
      if (args.body !== undefined) {
        updates.body = args.body
        changes.push('Body updated')
      }

      if (Object.keys(updates).length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Update template',
          templateType,
          title: template?.title || 'Template',
          changes: changes.join('; '),
          _table: table,
          _templateId: templateId,
          _updates: updates
        }
      }
    }

    case 'set_default_template': {
      const templateType = args.templateType as string
      const templateId = args.templateId as string
      if (!templateType || !templateId) {
        return { preview: {}, error: 'Template type and ID are required' }
      }

      const table = templateType === 'payment_sms' ? 'payment_sms_templates' : 'review_sms_templates'

      const { data: template } = await supabaseAdmin
        .from(table)
        .select('id, title')
        .eq('org_id', orgId)
        .eq('id', templateId)
        .maybeSingle()

      return {
        preview: {
          action: 'Set default template',
          templateType,
          title: template?.title || 'Template',
          _table: table,
          _templateId: templateId
        }
      }
    }

    case 'create_sms_template': {
      const body = (args.body as string | undefined)?.trim()
      if (!body) {
        return { preview: {}, error: 'Template body is required' }
      }
      const title = (args.title as string | undefined)?.trim() || 'Custom follow-up'

      return {
        preview: {
          action: 'Create SMS template',
          title,
          body
        }
      }
    }

    case 'create_workflow': {
      const name = (args.name as string | undefined)?.trim()
      const triggerType = args.triggerType as string | undefined
      if (!name || !triggerType) {
        return { preview: {}, error: 'Workflow name and trigger type are required' }
      }

      const steps = Array.isArray(args.steps) ? args.steps : []

      return {
        preview: {
          action: 'Create workflow',
          name,
          triggerType,
          steps: steps.length
        }
      }
    }

    case 'update_workflow': {
      const workflowId = args.workflowId as string
      if (!workflowId) {
        return { preview: {}, error: 'Workflow ID is required' }
      }

      const { data: workflow } = await supabaseAdmin
        .from('workflows')
        .select('id, name, trigger_type')
        .eq('org_id', orgId)
        .eq('id', workflowId)
        .maybeSingle()

      if (!workflow) {
        return { preview: {}, error: 'Workflow not found' }
      }

      const changes: string[] = []
      if (args.name !== undefined) changes.push('Name updated')
      if (args.description !== undefined) changes.push('Description updated')
      if (args.enabled !== undefined) changes.push(args.enabled ? 'Enabled' : 'Disabled')
      if (args.triggerType !== undefined) changes.push(`Trigger -> ${args.triggerType}`)
      if (args.triggerConfig !== undefined) changes.push('Trigger config updated')
      if (args.steps !== undefined) changes.push('Steps updated')

      if (changes.length === 0) {
        return { preview: {}, error: 'No changes specified' }
      }

      return {
        preview: {
          action: 'Update workflow',
          name: workflow.name,
          changes: changes.join('; '),
          _workflowId: workflowId
        }
      }
    }

    case 'delete_workflow': {
      const workflowId = args.workflowId as string
      if (!workflowId) {
        return { preview: {}, error: 'Workflow ID is required' }
      }

      const { data: workflow } = await supabaseAdmin
        .from('workflows')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('id', workflowId)
        .maybeSingle()

      if (!workflow) {
        return { preview: {}, error: 'Workflow not found' }
      }

      return {
        preview: {
          action: 'Delete workflow',
          name: workflow.name,
          _workflowId: workflowId
        }
      }
    }

    case 'summarize_call': {
      let callId = args.callId as string | undefined
      let call: any = null

      if (callId) {
        const { data } = await supabaseAdmin
          .from('dialpad_calls')
          .select('call_id, direction, duration, created_at, external_number')
          .eq('org_id', orgId)
          .eq('call_id', callId)
          .maybeSingle()
        call = data
        if (!call) {
          const { data: fallback } = await supabaseAdmin
            .from('dialpad_calls')
            .select('call_id, direction, duration, created_at, external_number')
            .eq('org_id', orgId)
            .eq('id', callId)
            .maybeSingle()
          call = fallback
          callId = fallback?.call_id || callId
        }
      } else if (args.customerName) {
        const { data: leads } = await supabaseAdmin
          .from('extracted_leads')
          .select('phone_number, name')
          .eq('org_id', orgId)
          .ilike('name', `%${args.customerName}%`)
          .limit(1)
        const lead = leads?.[0]
        if (lead?.phone_number) {
          const { data } = await supabaseAdmin
            .from('dialpad_calls')
            .select('call_id, direction, duration, created_at, external_number')
            .eq('org_id', orgId)
            .eq('external_number', lead.phone_number)
            .order('created_at', { ascending: false })
            .limit(1)
          if (data?.length) {
            call = data[0]
            callId = call.call_id
          }
        }
      }

      if (!callId) {
        return { preview: {}, error: 'Call ID is required' }
      }

      return {
        preview: {
          action: 'Summarize call',
          callId,
          direction: call?.direction || 'unknown',
          duration: call?.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : 'Unknown',
          date: call?.created_at ? new Date(call.created_at).toLocaleString('en-AU') : 'Unknown',
          _callId: callId
        }
      }
    }

    case 'sync_emails': {
      return {
        preview: {
          action: 'Sync Outlook emails',
          detail: 'Fetch latest inbox and sent messages'
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
  preview: Record<string, unknown>,
  requestAuthHeader?: string | null
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
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/quote-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'apikey': serviceKey,
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
      const phoneRaw = preview._phone as string
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw
      const message = args.message as string

      if (!phone || !message) {
        return { success: false, error: 'Missing phone number or message' }
      }

      // Call the dialpad-send-sms edge function
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
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

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/update-lead-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ leadId, status: newStatus })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to update lead status: ${errorText}` }
      }

      return { success: true, message: `${preview.customer}'s status has been updated to \"${newStatus}\"` }
    }

    // === NEW ACTION EXECUTORS ===

    case 'create_lead': {
      const name = args.name as string
      const phoneRaw = args.phone as string | undefined
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw
      const email = args.email as string | undefined
      const notes = args.notes as string | undefined
      const status = (args.status as string) || 'Unanswered'

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
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/create-booking-series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
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
      const phoneRaw = preview._phone as string
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw

      if (!phone) {
        return { success: false, error: 'Phone number is required' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-initiate-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
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
      const occurrenceId = preview._occurrenceId as string | undefined
      const quoteId = preview._quoteId as string | undefined
      const shareToken = preview._shareToken as string | undefined
      const description = (preview._description as string) || (args.description as string) || `Payment for ${preview.customer}`

      if (!amountCents) {
        return { success: false, error: 'Amount is required' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const siteUrl = getSiteUrl()
      let successUrl = `${siteUrl}/payment-success`
      let cancelUrl = `${siteUrl}/payment-cancel`
      if (shareToken) {
        successUrl = `${siteUrl}?quote=${shareToken}&payment_status=success`
        cancelUrl = `${siteUrl}?quote=${shareToken}&payment_status=cancelled`
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-payment-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({
          amount_cents: amountCents,
          currency: 'aud',
          description,
          occurrenceId,
          quoteId,
          customerName: preview.customer,
          customerEmail: preview._customerEmail,
          success_url: successUrl,
          cancel_url: cancelUrl
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to create payment link: ${errorText}` }
      }

      const result = await response.json()
      const linkUrl = result?.url

      if (occurrenceId && linkUrl) {
        const { error: updateError } = await supabaseAdmin
          .from('booking_occurrences')
          .update({
            payment_link: linkUrl,
            payment_status: 'invoice_sent',
            payment_amount_cents: amountCents
          })
          .eq('id', occurrenceId)
          .eq('org_id', orgId)

        if (updateError) {
          return { success: false, error: updateError.message }
        }
      }

      return {
        success: true,
        message: linkUrl ? `Created payment link for ${preview.customer}: ${linkUrl}` : 'Created payment link'
      }
    }

    case 'start_marketing_loop':
    case 'pause_marketing_loop':
    case 'cancel_marketing_loop':
    case 'resume_marketing_loop':
    case 'send_marketing_now':
    case 'set_marketing_step': {
      const leadId = preview._leadId as string
      const journeyType = (preview._journeyType as string) || (toolName === 'send_marketing_now' ? 'sms' : 'both')
      const action = toolName === 'start_marketing_loop' ? 'start'
        : toolName === 'pause_marketing_loop' ? 'pause'
        : toolName === 'cancel_marketing_loop' ? 'cancel'
        : toolName === 'resume_marketing_loop' ? 'resume'
        : toolName === 'send_marketing_now' ? 'send_now'
        : 'set_step'

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/marketing-loop-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({
          action,
          leadId,
          journeyType,
          ...(action === 'set_step' ? { step: preview._step || args.step } : {})
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `Failed to ${action} marketing: ${errorText}` }
      }

      const actionPastTense = action === 'start'
        ? 'started'
        : action === 'pause'
          ? 'paused'
          : action === 'cancel'
            ? 'cancelled'
            : action === 'resume'
              ? 'resumed'
              : action === 'send_now'
                ? 'sent'
                : 'updated'
      return {
        success: true,
        message: `Marketing automation ${actionPastTense}${action === 'set_step' ? ` to step ${preview._step || args.step}` : ''} for ${preview.customer}`
      }
    }

            case 'reschedule_booking': {
      const occurrenceId = preview._occurrenceId as string
      const newDateTime = preview._newDateTime as string
      const durationMs = (preview._durationMs as number) || 2 * 60 * 60 * 1000

      if (!occurrenceId || !newDateTime) {
        return { success: false, error: 'Missing booking ID or new date/time' }
      }

      const newDate = new Date(newDateTime)
      const endAt = new Date(newDate.getTime() + durationMs)

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({
          start_at: newDate.toISOString(),
          end_at: endAt.toISOString()
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
        const normalized = normalizePhoneToE164AU(preview._newPhone) || preview._newPhone
        updates.phone_number = normalized
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
      const updates = preview._updates as Record<string, unknown> | undefined

      if (!quoteId || !updates) {
        return { success: false, error: 'Missing quote data' }
      }

      const { error } = await supabaseAdmin
        .from('quotes')
        .update(updates)
        .eq('id', quoteId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      const leadId = preview._leadId as string | undefined
      const customerUpdates = preview._customerUpdates as Record<string, unknown> | undefined
      if (leadId && customerUpdates && (customerUpdates.name || customerUpdates.email || customerUpdates.phone_number)) {
        const leadPayload: Record<string, unknown> = {}
        if (customerUpdates.name) leadPayload.name = customerUpdates.name
        if (customerUpdates.email) leadPayload.email = customerUpdates.email
        if (customerUpdates.phone_number) leadPayload.phone_number = customerUpdates.phone_number
        if (Object.keys(leadPayload).length > 0) {
          await supabaseAdmin
            .from('extracted_leads')
            .update(leadPayload)
            .eq('id', leadId)
            .eq('org_id', orgId)
        }
      }

      return {
        success: true,
        message: `Updated quote #${preview.quoteNumber || quoteId.slice(0, 8)} for ${preview.customer || 'customer'}`
      }
    }

    case 'mark_booking_paid': {
      const occurrenceId = preview._occurrenceId as string
      const amountCents = preview._amountCents as number | null
      const paymentMethod = preview._paymentMethod as string | undefined

      if (!occurrenceId) {
        return { success: false, error: 'Missing booking ID' }
      }

      const paymentNotes = paymentMethod
        ? `Marked paid (${paymentMethod}) on ${new Date().toLocaleString('en-AU')}`
        : `Marked paid on ${new Date().toLocaleString('en-AU')}`

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({
          payment_status: 'paid',
          payment_amount_cents: amountCents || null,
          payment_paid_at: new Date().toISOString(),
          payment_notes: paymentNotes
        })
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Recorded payment for ${preview.customer}'s job on ${preview.jobDate}`
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

    case 'extract_lead_info': {
      const emailId = preview._emailId as string
      if (!emailId) {
        return { success: false, error: 'Missing email ID' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/extract-lead-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ email_id: emailId })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        return { success: false, error: result?.error || 'Failed to extract lead' }
      }

      return {
        success: true,
        message: `Extracted lead from email ${emailId}`
      }
    }

    case 'delete_lead': {
      const leadId = preview._leadId as string
      if (!leadId) {
        return { success: false, error: 'Missing lead ID' }
      }

      const { error } = await supabaseAdmin
        .from('extracted_leads')
        .delete()
        .eq('id', leadId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Deleted lead ${preview.customer || ''}`.trim() }
    }

    case 'send_lead_sms': {
      const phoneRaw = preview._phone as string
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw
      const message = preview._message as string
      const leadId = preview._leadId as string

      if (!phone || !message) {
        return { success: false, error: 'Missing phone or message' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ phone_number: phone, message })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        return { success: false, error: result?.error || 'Failed to send SMS' }
      }

      const sentAtIso = new Date().toISOString()
      if (leadId) {
        await supabaseAdmin
          .from('extracted_leads')
          .update({ last_text_date: sentAtIso, last_text_body: message })
          .eq('id', leadId)
          .eq('org_id', orgId)
      }

      return { success: true, message: `SMS sent successfully to ${preview.customer || 'lead'}` }
    }

    case 'send_quote_sms': {
      const phoneRaw = preview._phone as string
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw
      const message = preview._message as string

      if (!phone || !message) {
        return { success: false, error: 'Missing phone or message' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ phone_number: phone, message })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        return { success: false, error: result?.error || 'Failed to send SMS' }
      }

      return { success: true, message: `Quote SMS sent to ${preview.customer || 'customer'}` }
    }

    case 'delete_quote': {
      const quoteId = preview._quoteId as string
      if (!quoteId) {
        return { success: false, error: 'Missing quote ID' }
      }

      const { error } = await supabaseAdmin
        .from('quotes')
        .delete()
        .eq('id', quoteId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Deleted quote for ${preview.customer || 'customer'}` }
    }

    case 'unassign_cleaner': {
      const occurrenceId = preview._occurrenceId as string
      if (!occurrenceId) {
        return { success: false, error: 'Missing booking ID' }
      }

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update({ cleaner_id: null, assigned_at: null })
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Cleaner unassigned for ${preview.customer}'s job on ${preview.jobDate}` }
    }

    case 'update_booking_address': {
      const seriesId = preview._seriesId as string
      if (!seriesId) {
        return { success: false, error: 'Missing booking series ID' }
      }

      const { error } = await supabaseAdmin
        .from('booking_series')
        .update({
          service_address: preview._address || null,
          service_lat: preview._lat ?? null,
          service_lng: preview._lng ?? null
        })
        .eq('id', seriesId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Updated booking address for ${preview.customer}` }
    }

    case 'update_booking_series': {
      const seriesId = preview._seriesId as string
      const updates = preview._updates as Record<string, unknown> | undefined

      if (!seriesId || !updates) {
        return { success: false, error: 'Missing booking series data' }
      }

      const { error } = await supabaseAdmin
        .from('booking_series')
        .update(updates)
        .eq('id', seriesId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Updated booking series for ${preview.customer}` }
    }

    case 'set_payment_status': {
      const occurrenceId = preview._occurrenceId as string
      const paymentStatus = preview._paymentStatus as string
      const amountCents = preview._amountCents as number | null
      const notes = preview._notes as string | undefined

      if (!occurrenceId || !paymentStatus) {
        return { success: false, error: 'Missing booking ID or payment status' }
      }

      const updates: Record<string, unknown> = {
        payment_status: paymentStatus
      }
      if (amountCents !== null && amountCents !== undefined) {
        updates.payment_amount_cents = amountCents
      }
      if (paymentStatus === 'paid') {
        updates.payment_paid_at = new Date().toISOString()
        updates.payment_notes = notes || `Marked paid manually on ${new Date().toLocaleString('en-AU')}`
      } else {
        updates.payment_paid_at = null
        if (notes) updates.payment_notes = notes
      }

      const { error } = await supabaseAdmin
        .from('booking_occurrences')
        .update(updates)
        .eq('id', occurrenceId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Payment status updated for ${preview.customer}` }
    }

    case 'send_payment_reminder_sms': {
      const phoneRaw = preview._phone as string
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw
      const message = preview._message as string
      const occurrenceId = preview._occurrenceId as string

      if (!phone || !message || !occurrenceId) {
        return { success: false, error: 'Missing SMS details' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ phone_number: phone, message })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        return { success: false, error: result?.error || 'Failed to send SMS' }
      }

      const sentAt = new Date().toISOString()
      await supabaseAdmin
        .from('payment_sms_logs')
        .insert({
          org_id: orgId,
          occurrence_id: occurrenceId,
          template_id: preview._templateId || null,
          body: message,
          tone: preview._templateTone || null,
          amount_cents: preview._amountCents || null,
          sent_at: sentAt
        })

      return { success: true, message: `Payment reminder sent to ${preview.customer}` }
    }

    case 'send_review_reminder_sms': {
      const phoneRaw = preview._phone as string
      const phone = normalizePhoneToE164AU(phoneRaw) || phoneRaw
      const message = preview._message as string
      const occurrenceId = preview._occurrenceId as string

      if (!phone || !message || !occurrenceId) {
        return { success: false, error: 'Missing SMS details' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ phone_number: phone, message })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        return { success: false, error: result?.error || 'Failed to send SMS' }
      }

      const sentAt = new Date().toISOString()
      await supabaseAdmin
        .from('review_sms_logs')
        .insert({
          org_id: orgId,
          occurrence_id: occurrenceId,
          template_id: preview._templateId || null,
          body: message,
          tone: preview._templateTone || null,
          sent_at: sentAt
        })

      return { success: true, message: `Review reminder sent to ${preview.customer}` }
    }

    case 'create_cleaner': {
      const fullName = args.fullName as string
      if (!fullName) {
        return { success: false, error: 'Cleaner name is required' }
      }

      const payload: Record<string, unknown> = {
        org_id: orgId,
        full_name: fullName
      }

      const phoneRaw = args.phone as string | undefined
      const phone = phoneRaw ? (normalizePhoneToE164AU(phoneRaw) || phoneRaw) : undefined

      if (phone !== undefined) payload.phone = phone
      if (args.email !== undefined) payload.email = args.email
      if (args.baseLocationText !== undefined) payload.base_location_text = args.baseLocationText
      if (args.baseLat !== undefined) payload.base_lat = args.baseLat
      if (args.baseLng !== undefined) payload.base_lng = args.baseLng
      if (args.abn !== undefined) payload.abn = args.abn
      if (args.bankAccountName !== undefined) payload.bank_account_name = args.bankAccountName
      if (args.bankBsb !== undefined) payload.bank_bsb = args.bankBsb
      if (args.bankAccountNumber !== undefined) payload.bank_account_number = args.bankAccountNumber
      if (args.minBookingMinutes !== undefined) payload.min_booking_minutes = args.minBookingMinutes
      if (args.noticeHours !== undefined) payload.notice_hours = args.noticeHours
      if (args.cancellationPolicy !== undefined) payload.cancellation_policy = args.cancellationPolicy
      if (args.hasTransport !== undefined) payload.has_transport = args.hasTransport
      if (args.transportType !== undefined) payload.transport_type = args.transportType
      if (args.maxTravelKm !== undefined) payload.max_travel_km = args.maxTravelKm
      if (args.canTransportEquipment !== undefined) payload.can_transport_equipment = args.canTransportEquipment
      if (args.publicLiabilityPolicyNumber !== undefined) payload.public_liability_policy_number = args.publicLiabilityPolicyNumber
      if (args.publicLiabilityExpiry !== undefined) payload.public_liability_expiry = args.publicLiabilityExpiry
      if (args.teamSize !== undefined) payload.team_size = args.teamSize
      if (args.rates !== undefined) payload.rates = args.rates
      if (args.availability !== undefined) payload.availability = args.availability
      if (args.active !== undefined) payload.active = args.active

      const { error } = await supabaseAdmin
        .from('cleaners')
        .insert(payload)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Created cleaner ${fullName}` }
    }

    case 'update_cleaner': {
      const cleanerId = preview._cleanerId as string
      const updates = preview._updates as Record<string, unknown> | undefined

      if (!cleanerId || !updates) {
        return { success: false, error: 'Missing cleaner data' }
      }

      const { error } = await supabaseAdmin
        .from('cleaners')
        .update(updates)
        .eq('id', cleanerId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Updated cleaner ${preview.cleaner || ''}`.trim() }
    }

    case 'delete_cleaner': {
      const cleanerId = preview._cleanerId as string
      if (!cleanerId) {
        return { success: false, error: 'Missing cleaner ID' }
      }

      const { error } = await supabaseAdmin
        .from('cleaners')
        .delete()
        .eq('id', cleanerId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Deleted cleaner ${preview.cleaner || ''}`.trim() }
    }

    case 'create_cleaner_review': {
      const occurrenceId = preview._occurrenceId as string
      const cleanerId = preview._cleanerId as string
      const rating = preview._rating as number
      const notes = preview._notes as string | undefined

      if (!occurrenceId || !cleanerId || !rating) {
        return { success: false, error: 'Missing review details' }
      }

      const { error } = await supabaseAdmin
        .from('cleaner_job_reviews')
        .insert({
          org_id: orgId,
          occurrence_id: occurrenceId,
          cleaner_id: cleanerId,
          rating,
          notes: notes || null
        })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Saved review for ${preview.cleaner}` }
    }

    case 'update_cleaner_payout': {
      const payoutId = preview._payoutId as string
      const updates = preview._updates as Record<string, unknown> | undefined

      if (!payoutId || !updates) {
        return { success: false, error: 'Missing payout data' }
      }

      const { error } = await supabaseAdmin
        .from('cleaner_payouts')
        .update(updates)
        .eq('id', payoutId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Updated payout for ${preview.cleaner || 'cleaner'}` }
    }

    case 'mark_cleaner_payout_paid': {
      const payoutId = preview._payoutId as string
      const markPaid = preview._markPaid as boolean

      if (!payoutId) {
        return { success: false, error: 'Missing payout ID' }
      }

      const updates = {
        paid_at: markPaid ? new Date().toISOString() : null,
        paid_by: markPaid ? 'admin' : null
      }

      const { error } = await supabaseAdmin
        .from('cleaner_payouts')
        .update(updates)
        .eq('id', payoutId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: markPaid ? 'Payout marked as paid' : 'Payout marked as unpaid' }
    }

    case 'create_todo': {
      const title = args.title as string
      if (!title) {
        return { success: false, error: 'Todo title is required' }
      }

      const payload = {
        org_id: orgId,
        type: 'manual',
        title,
        description: (args.description as string | undefined) || null,
        is_completed: false,
        auto_generated: false,
        roll_over: args.rollOver !== undefined ? Boolean(args.rollOver) : true,
        due_date: (args.dueDate as string | undefined) || null
      }

      const { error } = await supabaseAdmin
        .from('todos')
        .insert(payload)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Todo created: ${title}` }
    }

    case 'update_todo': {
      const todoId = preview._todoId as string
      const updates = preview._updates as Record<string, unknown> | undefined

      if (!todoId || !updates) {
        return { success: false, error: 'Missing todo data' }
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'is_completed')) {
        const isCompleted = Boolean(updates.is_completed)
        updates.completed_at = isCompleted ? new Date().toISOString() : null
      }

      const { error } = await supabaseAdmin
        .from('todos')
        .update(updates)
        .eq('id', todoId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Todo updated' }
    }

    case 'delete_todo': {
      const todoId = preview._todoId as string
      if (!todoId) {
        return { success: false, error: 'Missing todo ID' }
      }

      const { error } = await supabaseAdmin
        .from('todos')
        .delete()
        .eq('id', todoId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Todo deleted' }
    }

    case 'send_team_invite': {
      const email = (args.email as string | undefined)?.trim()
      if (!email) {
        return { success: false, error: 'Email is required' }
      }
      const role = (args.role as string) || 'staff'

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ email, role })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        return { success: false, error: result?.error || 'Failed to send invite' }
      }

      return { success: true, message: `Invite sent to ${email}` }
    }

    case 'update_member_role': {
      const memberId = preview._memberId as string
      const role = preview._role as string

      if (!memberId || !role) {
        return { success: false, error: 'Missing member data' }
      }

      const { error } = await supabaseAdmin
        .from('organization_members')
        .update({ role })
        .eq('id', memberId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Member role updated to ${role}` }
    }

    case 'remove_member': {
      const memberId = preview._memberId as string
      if (!memberId) {
        return { success: false, error: 'Missing member ID' }
      }

      const { error } = await supabaseAdmin
        .from('organization_members')
        .delete()
        .eq('id', memberId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Member removed' }
    }

    case 'revoke_invite': {
      const inviteId = preview._inviteId as string
      if (!inviteId) {
        return { success: false, error: 'Missing invite ID' }
      }

      const { error } = await supabaseAdmin
        .from('organization_invites')
        .delete()
        .eq('id', inviteId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Invite revoked' }
    }

    case 'update_integration': {
      const provider = (preview._provider as string) || (args.provider as string)
      if (!provider) {
        return { success: false, error: 'Provider is required' }
      }

      const { data: existing } = await supabaseAdmin
        .from('organization_integrations')
        .select('enabled, config')
        .eq('org_id', orgId)
        .eq('provider', provider)
        .maybeSingle()

      const enabled = args.enabled !== undefined ? Boolean(args.enabled) : (existing?.enabled ?? false)
      const config = args.config !== undefined ? args.config : (existing?.config ?? {})

      const { error } = await supabaseAdmin
        .from('organization_integrations')
        .upsert({
          org_id: orgId,
          provider,
          enabled,
          config
        }, { onConflict: 'org_id,provider' })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Integration ${provider} updated` }
    }

    case 'update_org_settings': {
      const updates = preview._updates as Record<string, unknown> | undefined
      if (!updates || Object.keys(updates).length === 0) {
        return { success: false, error: 'No updates provided' }
      }

      const { error } = await supabaseAdmin
        .from('organizations')
        .update(updates)
        .eq('id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Organization settings updated' }
    }

    case 'update_automation_setting': {
      const automationType = (preview._automationType as string) || (args.automationType as string)
      if (!automationType) {
        return { success: false, error: 'Automation type is required' }
      }

      const { data: existing } = await supabaseAdmin
        .from('organization_automation_settings')
        .select('enabled, config')
        .eq('org_id', orgId)
        .eq('automation_type', automationType)
        .maybeSingle()

      const nextEnabled = args.enabled !== undefined ? Boolean(args.enabled) : (existing?.enabled ?? true)
      const nextConfig = args.config && typeof args.config === 'object'
        ? { ...(existing?.config ?? {}), ...(args.config as Record<string, unknown>) }
        : (existing?.config ?? {})

      const { error } = await supabaseAdmin
        .from('organization_automation_settings')
        .upsert({
          org_id: orgId,
          automation_type: automationType,
          enabled: nextEnabled,
          config: nextConfig
        }, { onConflict: 'org_id,automation_type' })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `Automation setting ${automationType} updated` }
    }

    case 'update_template': {
      const table = preview._table as string
      const templateId = preview._templateId as string
      const updates = preview._updates as Record<string, unknown> | undefined

      if (!table || !templateId || !updates) {
        return { success: false, error: 'Missing template data' }
      }

      const { error } = await supabaseAdmin
        .from(table)
        .update(updates)
        .eq('id', templateId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Template updated' }
    }

    case 'set_default_template': {
      const table = preview._table as string
      const templateId = preview._templateId as string

      if (!table || !templateId) {
        return { success: false, error: 'Missing template data' }
      }

      await supabaseAdmin
        .from(table)
        .update({ is_default: false })
        .eq('org_id', orgId)

      const { error } = await supabaseAdmin
        .from(table)
        .update({ is_default: true })
        .eq('id', templateId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Default template updated' }
    }

    case 'create_sms_template': {
      const title = (args.title as string | undefined)?.trim() || 'Custom follow-up'
      const body = (args.body as string | undefined)?.trim()

      if (!body) {
        return { success: false, error: 'Template body is required' }
      }

      const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const slug = `${slugBase || 'custom-template'}-${Math.random().toString(36).slice(2, 6)}`
      const nowIso = new Date().toISOString()

      const { error } = await supabaseAdmin
        .from('sms_templates')
        .insert({
          title,
          body,
          slug,
          is_default: false,
          updated_at: nowIso
        })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: `SMS template created: ${title}` }
    }

    case 'create_workflow': {
      const name = (args.name as string | undefined)?.trim()
      const triggerType = args.triggerType as string | undefined
      const description = (args.description as string | undefined)?.trim() || null
      const enabled = Boolean(args.enabled)
      const triggerConfig = (args.triggerConfig as Record<string, unknown>) || {}
      const steps = Array.isArray(args.steps) ? args.steps : []

      if (!name || !triggerType) {
        return { success: false, error: 'Workflow name and trigger type are required' }
      }

      const { data: newWorkflow, error: createError } = await supabaseAdmin
        .from('workflows')
        .insert({
          org_id: orgId,
          name,
          description,
          enabled,
          trigger_type: triggerType,
          trigger_config: triggerConfig
        })
        .select('id')
        .single()

      if (createError || !newWorkflow) {
        return { success: false, error: createError?.message || 'Failed to create workflow' }
      }

      if (steps.length > 0) {
        const stepsToInsert = steps.map((step: any, index: number) => ({
          workflow_id: newWorkflow.id,
          step_order: index + 1,
          action_type: step.actionType,
          action_config: step.actionConfig || {}
        }))

        const { error: stepsError } = await supabaseAdmin
          .from('workflow_steps')
          .insert(stepsToInsert)

        if (stepsError) {
          return { success: false, error: stepsError.message }
        }
      }

      return { success: true, message: `Workflow created: ${name}` }
    }

    case 'update_workflow': {
      const workflowId = args.workflowId as string
      if (!workflowId) {
        return { success: false, error: 'Workflow ID is required' }
      }

      const updates: Record<string, unknown> = {}
      if (args.name !== undefined) updates.name = (args.name as string).trim()
      if (args.description !== undefined) updates.description = (args.description as string).trim() || null
      if (args.enabled !== undefined) updates.enabled = Boolean(args.enabled)
      if (args.triggerType !== undefined) updates.trigger_type = args.triggerType
      if (args.triggerConfig !== undefined) updates.trigger_config = args.triggerConfig

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('workflows')
          .update(updates)
          .eq('id', workflowId)
          .eq('org_id', orgId)

        if (updateError) {
          return { success: false, error: updateError.message }
        }
      }

      if (Array.isArray(args.steps)) {
        await supabaseAdmin
          .from('workflow_steps')
          .delete()
          .eq('workflow_id', workflowId)

        const stepsToInsert = (args.steps as any[]).map((step: any, index: number) => ({
          workflow_id: workflowId,
          step_order: index + 1,
          action_type: step.actionType,
          action_config: step.actionConfig || {}
        }))

        if (stepsToInsert.length > 0) {
          const { error: stepsError } = await supabaseAdmin
            .from('workflow_steps')
            .insert(stepsToInsert)

          if (stepsError) {
            return { success: false, error: stepsError.message }
          }
        }
      }

      return { success: true, message: 'Workflow updated' }
    }

    case 'delete_workflow': {
      const workflowId = preview._workflowId as string
      if (!workflowId) {
        return { success: false, error: 'Workflow ID is required' }
      }

      const { error } = await supabaseAdmin
        .from('workflows')
        .delete()
        .eq('id', workflowId)
        .eq('org_id', orgId)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: 'Workflow deleted' }
    }

    case 'summarize_call': {
      const callId = preview._callId as string
      if (!callId) {
        return { success: false, error: 'Call ID is required' }
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/get-transcript-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({ call_id: callId })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        return { success: false, error: result?.error || 'Failed to summarize call' }
      }

      return { success: true, message: `Call summarized for ${callId}` }
    }

    case 'sync_emails': {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const authorizationHeader = requestAuthHeader || `Bearer ${serviceKey}`

      const response = await fetch(`${supabaseUrl}/functions/v1/outlook-email-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'X-Org-Id': orgId
        },
        body: JSON.stringify({})
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        return { success: false, error: result?.error || 'Failed to sync emails' }
      }

      return { success: true, message: `Synced ${result.total || 0} emails` }
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
8. When saving phone numbers, normalise to E.164. For Australian mobiles, store as +614XXXXXXXX (no spaces).

Lead statuses: Unanswered, Marketing Loop, Follow Up, Quote Sent, Job Won, Jobs Completed, Not interested
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
        confirmAction.preview,
        req.headers.get('Authorization')
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
        case 'get_quote_share_link':
          result = await handleGetQuoteShareLink(ctx, toolArgs)
          break
        case 'get_todos':
          result = await handleGetTodos(ctx, toolArgs)
          break
        case 'get_cleaner_payouts':
          result = await handleGetCleanerPayouts(ctx, toolArgs)
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


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// ---------------------------------------------------------------------------
// Helper: generate a URL-safe slug from a business name
// ---------------------------------------------------------------------------
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // remove special chars
    .replace(/[\s]+/g, '-')         // spaces -> hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
}

// ---------------------------------------------------------------------------
// Seed helpers — create default template rows for a new org
// ---------------------------------------------------------------------------

async function seedPaymentSmsTemplates(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
) {
  const templates = [
    {
      org_id: orgId,
      label: 'Friendly reminder',
      stage: 'friendly',
      body: 'Hi {{customer_name}}, just a friendly reminder that your invoice of {{amount}} for {{service}} is due. Please let us know if you have any questions. Thank you!',
      sort_order: 1,
    },
    {
      org_id: orgId,
      label: 'Firm reminder',
      stage: 'firm',
      body: 'Hi {{customer_name}}, this is a follow-up regarding your outstanding balance of {{amount}} for {{service}}. Please arrange payment at your earliest convenience to avoid any service disruption.',
      sort_order: 2,
    },
    {
      org_id: orgId,
      label: 'Final notice',
      stage: 'final',
      body: 'Hi {{customer_name}}, this is a final notice regarding your overdue balance of {{amount}}. Please make payment immediately to avoid further action. Contact us if you need to discuss payment options.',
      sort_order: 3,
    },
  ]

  const { error } = await supabase.from('payment_sms_templates').insert(templates)
  if (error) console.error('Error seeding payment SMS templates:', error.message)
}

async function seedReviewSmsTemplates(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
) {
  const templates = [
    {
      org_id: orgId,
      label: 'Post-service review request',
      stage: 'initial',
      body: 'Hi {{customer_name}}, thank you for choosing {{business_name}}! We\'d love to hear how we did. Could you take a moment to leave us a review? {{review_link}}',
      sort_order: 1,
    },
    {
      org_id: orgId,
      label: 'Follow-up review request',
      stage: 'followup',
      body: 'Hi {{customer_name}}, we hope you enjoyed our {{service}} service. If you have a moment, a quick review would mean the world to us: {{review_link}} Thank you!',
      sort_order: 2,
    },
  ]

  const { error } = await supabase.from('review_sms_templates').insert(templates)
  if (error) console.error('Error seeding review SMS templates:', error.message)
}

async function seedMarketingEmailTemplates(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
) {
  const steps = [
    { step: 1, subject: 'Welcome to {{business_name}}', body: 'Hi {{customer_name}},\n\nThank you for your interest in {{business_name}}. We specialise in professional cleaning services tailored to your needs.\n\nWe\'d love to help — reply to this email or give us a call to get started.\n\nBest regards,\n{{business_name}}' },
    { step: 2, subject: 'A quick follow-up from {{business_name}}', body: 'Hi {{customer_name}},\n\nJust checking in to see if you had any questions about our services. We offer flexible scheduling and competitive rates.\n\nLet us know how we can help!\n\n{{business_name}}' },
    { step: 3, subject: 'Special offer from {{business_name}}', body: 'Hi {{customer_name}},\n\nWe\'d like to offer you a special introductory discount on your first booking. Get in touch to learn more!\n\nBest regards,\n{{business_name}}' },
    { step: 4, subject: 'Why choose {{business_name}}?', body: 'Hi {{customer_name}},\n\nHere are a few reasons our customers love us:\n- Professional, vetted cleaners\n- Flexible scheduling\n- 100% satisfaction guarantee\n\nReady to book? Reply to this email.\n\n{{business_name}}' },
    { step: 5, subject: 'Still thinking about it?', body: 'Hi {{customer_name}},\n\nWe understand choosing a cleaning service is a big decision. We\'re here to answer any questions you may have.\n\nFeel free to reach out anytime.\n\n{{business_name}}' },
    { step: 6, subject: 'Last chance — exclusive offer inside', body: 'Hi {{customer_name}},\n\nThis is your last chance to take advantage of our introductory offer. Don\'t miss out!\n\nBook now and experience the {{business_name}} difference.\n\n{{business_name}}' },
    { step: 7, subject: 'We\'d love to hear from you', body: 'Hi {{customer_name}},\n\nWe haven\'t heard from you in a while. If you\'re ever in need of our services, we\'re just a message away.\n\nWishing you all the best,\n{{business_name}}' },
  ]

  const rows = steps.map((s) => ({
    org_id: orgId,
    step: s.step,
    subject: s.subject,
    body: s.body,
    enabled: true,
  }))

  const { error } = await supabase.from('marketing_email_templates').insert(rows)
  if (error) console.error('Error seeding marketing email templates:', error.message)
}

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonError('Server configuration error', 500)
  }

  // Authenticate the caller
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonError('Unauthorized', 401)
  }
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return jsonError('Unauthorized', 401)
  }

  // Parse body
  let payload: {
    name?: string
    business_name?: string
    business_phone?: string
    business_email?: string
    business_abn?: string
    business_operating_name?: string
    bank_account_name?: string
    bank_bsb?: string
    bank_account_number?: string
  }

  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const name = payload.name?.trim()
  if (!name) {
    return jsonError('name is required', 400)
  }

  const slug = slugify(name)
  if (!slug) {
    return jsonError('Unable to generate slug from provided name', 400)
  }

  try {
    // 1. Create the organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug,
        business_name: payload.business_name?.trim() || name,
        business_phone: payload.business_phone?.trim() || null,
        business_email: payload.business_email?.trim() || user.email || null,
        business_abn: payload.business_abn?.trim() || null,
        business_operating_name: payload.business_operating_name?.trim() || null,
        bank_account_name: payload.bank_account_name?.trim() || null,
        bank_bsb: payload.bank_bsb?.trim() || null,
        bank_account_number: payload.bank_account_number?.trim() || null,
      })
      .select()
      .single()

    if (orgError || !org) {
      console.error('Error creating organization:', orgError)
      return jsonError(orgError?.message || 'Failed to create organization', 500)
    }

    const orgId = org.id as string

    // 2. Add the creator as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        org_id: orgId,
        user_id: user.id,
        role: 'owner',
      })

    if (memberError) {
      console.error('Error adding owner membership:', memberError)
      // Attempt cleanup
      await supabase.from('organizations').delete().eq('id', orgId)
      return jsonError(memberError.message || 'Failed to add owner membership', 500)
    }

    // 3. Set user preference to this new org
    const { error: prefError } = await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, current_org_id: orgId },
        { onConflict: 'user_id' },
      )

    if (prefError) {
      console.error('Error setting user preference:', prefError)
      // Non-fatal — the org was created successfully
    }

    // 4. Seed default templates (fire-and-forget, do not block response)
    await Promise.allSettled([
      seedPaymentSmsTemplates(supabase, orgId),
      seedReviewSmsTemplates(supabase, orgId),
      seedMarketingEmailTemplates(supabase, orgId),
    ])

    return jsonResponse({ success: true, organization: org })
  } catch (err) {
    console.error('Unexpected error in create-organization:', err)
    return jsonError(
      err instanceof Error ? err.message : 'Unexpected error',
      500,
    )
  }
})

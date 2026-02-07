import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getOrgIntegration, getOrg } from '../_shared/org-resolver.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

type Payload = {
  share_token?: string
  pay_full_amount?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Supabase service key missing' }, 500)
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let payload: Payload = {}
  try {
    payload = (await req.json()) as Payload
  } catch (_err) {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400)
  }

  const shareToken = payload.share_token
  const payFullAmount = Boolean(payload.pay_full_amount)
  if (!shareToken) {
    return jsonResponse({ error: 'share_token is required' }, 400)
  }

  try {
    const { data: quote, error } = await supabaseAdmin
      .from('quotes')
      .select(
        'id, org_id, total_inc_gst, deposit_amount, customer_email, customer_name, customer_phone, lead_id, quote_number'
      )
      .eq('share_token', shareToken)
      .single()

    if (error || !quote) {
      return jsonResponse({ error: 'Quote not found' }, 404)
    }

    // Load Stripe key from the quote's org integration
    const orgId = quote.org_id
    let stripeSecret = ''
    if (orgId) {
      const stripeConfig = await getOrgIntegration(supabaseAdmin, orgId, 'stripe')
      stripeSecret = stripeConfig.secret_key || ''
    }
    if (!stripeSecret) {
      return jsonResponse({ error: 'Stripe not configured for this organization' }, 500)
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' })

    const amountNumber = payFullAmount
      ? Number(quote.total_inc_gst)
      : Number(quote.deposit_amount ?? quote.total_inc_gst)

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return jsonResponse({ error: 'Invalid amount for quote' }, 400)
    }

    const amountCents = Math.round(amountNumber * 100)

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: {
        quote_id: quote.id,
        share_token: shareToken,
        pay_full_amount: payFullAmount ? 'true' : 'false',
        customer_email: quote.customer_email || '',
        customer_name: quote.customer_name || '',
        customer_phone: quote.customer_phone || '',
        lead_id: quote.lead_id || '',
        quote_number: quote.quote_number || '',
        org_id: orgId || '',
      },
    })

    return jsonResponse({
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      amount_cents: intent.amount,
      currency: intent.currency,
    })
  } catch (err) {
    console.error('Payment intent error:', err)
    const message = err instanceof Error ? err.message : 'Stripe error'
    return jsonResponse({ error: message }, 500)
  }
})

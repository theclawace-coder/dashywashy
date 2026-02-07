// Stripe webhook handler to mark payments as paid based on real events.
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getOrgIntegration } from '../_shared/org-resolver.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

async function markOccurrencePaid(
  occurrenceId: string,
  amountCents: number | null,
  note: string,
  paidAt: string
) {
  try {
    const { error } = await supabaseAdmin
      .from('booking_occurrences')
      .update({
        payment_status: 'paid',
        payment_paid_at: paidAt,
        payment_amount_cents: amountCents ?? undefined,
        payment_notes: note,
      })
      .eq('id', occurrenceId)

    if (error) {
      console.error('Failed to update occurrence payment', { occurrenceId, error })
    }
  } catch (err) {
    console.error('Unexpected occurrence update error', { occurrenceId, err })
  }
}

async function markQuotePaid(quoteId: string, paidAt: string) {
  try {
    const { error } = await supabaseAdmin
      .from('quotes')
      .update({ accepted_payment_method: 'card_paid', accepted_at: paidAt })
      .eq('id', quoteId)

    if (error) {
      console.error('Failed to update quote as paid', { quoteId, error })
    }
  } catch (err) {
    console.error('Unexpected quote update error', { quoteId, err })
  }
}

async function handleCheckoutSession(session: Stripe.Checkout.Session, stripe: Stripe) {
  const paidAt = new Date().toISOString()
  const amountCents = typeof session.amount_total === 'number' ? session.amount_total : null
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null

  let metadata: Record<string, string> = { ...(session.metadata || {}) }

  if (session.payment_link) {
    try {
      const paymentLink = await stripe.paymentLinks.retrieve(session.payment_link)
      metadata = { ...(paymentLink.metadata || {}), ...metadata }
    } catch (err) {
      console.error('Could not retrieve payment link metadata', err)
    }
  }

  const occurrenceId = metadata.occurrenceId || metadata.occurrence_id
  const quoteId = metadata.quoteId || metadata.quote_id
  const note = `Stripe checkout ${session.payment_status || 'paid'}${paymentIntentId ? ` (${paymentIntentId})` : ''}`

  if (occurrenceId) {
    await markOccurrencePaid(occurrenceId, amountCents, note, paidAt)
  }

  if (quoteId) {
    await markQuotePaid(quoteId, paidAt)
  }
}

async function handlePaymentIntent(intent: Stripe.PaymentIntent) {
  const paidAt =
    intent.status === 'succeeded' && intent.created
      ? new Date(intent.created * 1000).toISOString()
      : new Date().toISOString()
  const amountCents = typeof intent.amount_received === 'number' ? intent.amount_received : null
  const metadata: Record<string, string> = intent.metadata || {}
  const occurrenceId = metadata.occurrenceId || metadata.occurrence_id
  const quoteId = metadata.quoteId || metadata.quote_id
  const note = `Stripe payment intent ${intent.status}${intent.id ? ` (${intent.id})` : ''}`

  if (occurrenceId) {
    await markOccurrencePaid(occurrenceId, amountCents, note, paidAt)
  }

  if (quoteId) {
    await markQuotePaid(quoteId, paidAt)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Server missing required configuration' }, 500)
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header' }, 400)
  }

  const rawBody = await req.text()

  // We need to determine which org this webhook is for.
  // Parse the raw body to extract org_id from metadata, then load the org's Stripe config.
  let parsedBody: any = {}
  try { parsedBody = JSON.parse(rawBody) } catch { /* ignore */ }

  const eventMetadata = parsedBody?.data?.object?.metadata || {}
  const orgIdFromMeta = eventMetadata.org_id || ''

  // Try to determine stripe secrets from the org integration, fall back to env
  let stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') || ''
  let webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''

  if (orgIdFromMeta) {
    const stripeConfig = await getOrgIntegration(supabaseAdmin, orgIdFromMeta, 'stripe')
    if (stripeConfig.secret_key) stripeSecret = stripeConfig.secret_key
    if (stripeConfig.webhook_secret) webhookSecret = stripeConfig.webhook_secret
  }

  if (!stripeSecret || !webhookSecret) {
    return jsonResponse({ error: 'Stripe not configured' }, 500)
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' })

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe signature verification failed', err)
    return jsonResponse({ error: 'Invalid signature' }, 400)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSession(event.data.object as Stripe.Checkout.Session, stripe)
        break
      case 'payment_intent.succeeded':
      case 'payment_intent.processing':
        await handlePaymentIntent(event.data.object as Stripe.PaymentIntent)
        break
      default:
        // Ignore other event types
        break
    }
  } catch (err) {
    console.error('Webhook handler error', err)
    return jsonResponse({ error: 'Webhook processing error' }, 500)
  }

  return jsonResponse({ received: true })
})

import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno'
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

type CreatePaymentLinkPayload = {
  amount_cents: number
  currency?: string
  occurrenceId?: string
  quoteId?: string
  customerName?: string
  customerEmail?: string
  description?: string
  success_url?: string
  cancel_url?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
  const { orgId, supabaseAdmin, org } = await resolveOrgFromRequest(req)
  const stripeConfig = await getOrgIntegration(supabaseAdmin, orgId, 'stripe')
  const stripeSecret = stripeConfig.secret_key || ''
  const defaultSuccess = stripeConfig.success_url || 'https://example.com/payment-success'
  const defaultCancel = stripeConfig.cancel_url || 'https://example.com/payment-cancel'

  if (!stripeSecret) {
    return jsonError('Stripe not configured for this organization', 500)
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' })

  let payload: CreatePaymentLinkPayload
  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const amount = Number(payload.amount_cents)
  if (!Number.isFinite(amount) || amount < 1) {
    return jsonResponse({ error: 'amount_cents must be a positive integer (cents)' }, 400)
  }

  const currency = (payload.currency || 'aud').toLowerCase()
  const description = payload.description || 'Cleaning service'
  const successUrl = payload.success_url || defaultSuccess
  const cancelUrl = payload.cancel_url || defaultCancel

  try {
    const link = await stripe.paymentLinks.create({
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(amount),
            product_data: { name: description },
          },
        },
      ],
      metadata: {
        occurrenceId: payload.occurrenceId || '',
        quoteId: payload.quoteId || '',
        customerName: payload.customerName || '',
        customerEmail: payload.customerEmail || '',
      },
      after_completion: { type: 'redirect', redirect: { url: successUrl } },
      // Stripe does not currently support cancel_url on Payment Links; handled by user navigation.
    })

    return jsonResponse({ url: link.url, id: link.id })
  } catch (err) {
    console.error('Stripe payment link error:', err)
    const message = err instanceof Error ? err.message : 'Stripe error'
    return jsonError(message, 500)
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})



















import { useEffect, useMemo, useState } from 'react'
import { supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { STANDARD_ADD_ONS } from '../lib/quoteCalculator'

type QuoteRow = {
  id: string
  lead_id?: string | null
  quote_number?: string | null
  service: string
  bedrooms: number
  bathrooms: number
  addons: string[]
  custom_addons: { name: string; price: number }[]
  hourly_rate: number
  cleaner_rate: number
  main_service_hours: number
  add_on_hours: number
  total_hours: number
  subtotal: number
  discount_amount: number
  discount_percentage: number
  net_revenue: number
  gst: number
  total_inc_gst: number
  cleaner_pay: number
  profit: number
  margin: number
  deposit_percentage: number
  deposit_amount: number
  remaining_balance: number
  notes?: string | null
  address?: string | null
  description?: string | null
  accepted_at?: string | null
  accepted_name?: string | null
  accepted_signature?: string | null
  accepted_checkbox?: boolean | null
  accepted_date?: string | null
  accepted_payment_method?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  created_at?: string
  organization?: {
    business_name?: string | null
    business_operating_name?: string | null
    business_abn?: string | null
    bank_account_name?: string | null
    bank_bsb?: string | null
    bank_account_number?: string | null
  } | null
}

type QuotePublicViewProps = {
  shareToken: string
}

export default function QuotePublicView({ shareToken }: QuotePublicViewProps) {
  const [quote, setQuote] = useState<QuoteRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [acceptName, setAcceptName] = useState('')
  const [acceptDate, setAcceptDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [acceptChecked, setAcceptChecked] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentStatusHandled, setPaymentStatusHandled] = useState(false)

  useEffect(() => {
    const loadQuote = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/get-quote-public?share_token=${shareToken}`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        })

        const data = await response.json()
        if (!response.ok || !data?.quote) {
          setError(data?.error || 'Quote not found or link expired.')
          return
        }
        setQuote(data.quote as QuoteRow)
      } catch (err) {
        console.error('Failed to load quote', err)
        setError('Unable to load quote.')
      } finally {
        setLoading(false)
      }
    }

    loadQuote()
  }, [shareToken])

  const addOnList = useMemo(() => {
    if (!quote) return []
    return (quote.addons || []).map((key) => ({
      key,
      hours: STANDARD_ADD_ONS[key] || 0,
    }))
  }, [quote])

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`

  const computedPricing = useMemo(() => {
    if (!quote) return null
    const mainPrice = quote.main_service_hours * quote.hourly_rate
    const addOnPrice =
      addOnList.reduce((sum, a) => sum + a.hours * quote.hourly_rate, 0) +
      (quote.custom_addons || []).reduce((s, c) => s + (Number(c.price) || 0), 0)
    return {
      mainPrice,
      addOnPrice,
      totalEx: quote.net_revenue,
      totalInc: quote.total_inc_gst,
    }
  }, [quote, addOnList])

  const validateAcceptance = () => {
    if (!acceptName.trim()) {
      setInfoMessage('Please enter your name to accept the quote.')
      return false
    }
    if (!acceptChecked) {
      setInfoMessage('Please tick the acceptance checkbox.')
      return false
    }
    if (!acceptDate) {
      setInfoMessage('Please select a date.')
      return false
    }
    return true
  }

  // If Stripe redirected back with a success flag, mark the quote/lead as paid
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('payment_status')
    const redirectStatus = params.get('redirect_status')
    const intent = params.get('payment_intent')

    const isSuccess =
      status === 'success' ||
      redirectStatus === 'succeeded' ||
      redirectStatus === 'success' ||
      redirectStatus === 'paid' ||
      Boolean(intent && redirectStatus === 'succeeded')

    if (!isSuccess || !quote || paymentStatusHandled) return

    const markPaid = async () => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/mark-quote-paid-public`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ share_token: shareToken }),
        })
        const data = await response.json()
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to mark quote as paid')
        }

        setQuote({ ...quote, accepted_payment_method: 'card_paid' })
        setInfoMessage('Payment received. Thank you!')
      } catch (err) {
        console.error('Failed to mark payment as complete', err)
        setPaymentError('Payment completed, but we could not update the record automatically.')
      } finally {
        setPaymentStatusHandled(true)
      }
    }

    markPaid()
  }, [quote, paymentStatusHandled])

  const recordAcceptance = async (paymentMethod: 'direct_transfer' | 'card') => {
    if (!quote) return null
    if (!validateAcceptance()) return null
    setIsAccepting(true)
    setInfoMessage(null)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/accept-quote-public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          share_token: shareToken,
          accepted_name: acceptName,
          accepted_signature: acceptName,
          accepted_checkbox: true,
          accepted_date: acceptDate,
          accepted_payment_method: paymentMethod,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data?.quote) {
        throw new Error(data?.error || 'Could not record acceptance')
      }
      const nextQuote = data.quote as QuoteRow
      setQuote((prev) => ({
        ...(nextQuote || prev || {}),
        organization: nextQuote?.organization ?? prev?.organization ?? null,
      }))
      return nextQuote
    } catch (err) {
      console.error('Accept failed', err)
      setInfoMessage('Could not record acceptance. Please try again.')
      return null
    } finally {
      setIsAccepting(false)
    }
  }

  const handleAccept = async (paymentMethod: 'direct_transfer' | 'card') => {
    const updated = await recordAcceptance(paymentMethod)
    if (!updated) return
    setInfoMessage(
      paymentMethod === 'direct_transfer'
        ? 'Thanks! Acceptance recorded. Please pay via direct transfer using the quote number as reference.'
        : 'Thanks! Acceptance recorded.'
    )
  }

  const startCardPayment = async () => {
    if (!quote) return
    if (!validateAcceptance()) return
    if (quote.accepted_payment_method === 'card_paid') {
      setPaymentError('This quote is already marked as paid.')
      return
    }

    setPaymentError(null)
    setPaymentLoading(true)
    setInfoMessage('Preparing secure Stripe checkout...')
    try {
      const updated = await recordAcceptance('card')
      if (!updated) {
        setPaymentError('Unable to record acceptance.')
        return
      }

      // Create Stripe Payment Link
      const res = await fetch(`${supabaseUrl}/functions/v1/create-payment-link-public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          share_token: shareToken,
          success_url: `${window.location.origin}/quote?quote=${shareToken}&payment_status=success`,
          cancel_url: `${window.location.origin}/quote?quote=${shareToken}&payment_status=cancelled`,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Failed to create payment link')
      }

      setPaymentLinkUrl(data.url)
      setInfoMessage('Quote accepted! Click "Pay by Card" below to complete your payment.')
    } catch (err) {
      console.error('Card payment start failed', err)
      setPaymentError(err instanceof Error ? err.message : 'Failed to start card payment')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleCopyBankDetails = () => {
    if (!quote) return
    const org = quote.organization
    const bankAccountName = org?.bank_account_name?.trim() || ''
    const bankBsb = org?.bank_bsb?.trim() || ''
    const bankAccountNumber = org?.bank_account_number?.trim() || ''

    if (!bankAccountName || !bankBsb || !bankAccountNumber) {
      setInfoMessage('Bank details are not available yet. Please contact the business for payment info.')
      return
    }

    const text = [
      'Pay via direct transfer:',
      `Account Name: ${bankAccountName}`,
      `BSB: ${bankBsb}`,
      `Account: ${bankAccountNumber}`,
      `Reference: ${quote.quote_number || 'Quote number'}`,
    ].join('\n')
    navigator.clipboard
      .writeText(text)
      .then(() => setInfoMessage('Bank details copied. Please use the quote number as reference.'))
      .catch(() => setInfoMessage('Unable to copy. Please copy the bank details manually.'))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading quote...
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        {error || 'Quote not found.'}
      </div>
    )
  }

  const org = quote.organization
  const businessName = org?.business_operating_name || org?.business_name || 'Cleaning Service'
  const entityName = org?.business_name || businessName
  const businessOperatingName = org?.business_operating_name || org?.business_name || '—'
  const businessAbn = org?.business_abn || ''
  const bankAccountName = org?.bank_account_name?.trim() || ''
  const bankBsb = org?.bank_bsb?.trim() || ''
  const bankAccountNumber = org?.bank_account_number?.trim() || ''
  const hasBankDetails = Boolean(bankAccountName && bankBsb && bankAccountNumber)

  return (
    <div className="min-h-screen p-6 text-white">
      <div className="max-w-3xl mx-auto space-y-4 bg-[var(--color-surface)] border border-white/10 rounded-2xl p-6">
        <div className="space-y-1">
          <p className="text-[11px] uppercase text-[var(--color-text-muted)] tracking-[0.15em]">{businessName}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold text-white">Cleaning Quote {quote.quote_number ? `· ${quote.quote_number}` : ''}</h1>
            {quote.accepted_payment_method === 'card_paid' && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Paid
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">Service: {quote.service}</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {quote.bedrooms} bed / {quote.bathrooms} bath · Total inc GST ${quote.total_inc_gst.toFixed(2)}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-white/10 bg-black/20">
            <h3 className="font-semibold text-white">Customer</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{quote.customer_name || 'Valued customer'}</p>
            {quote.customer_phone && <p className="text-sm text-[var(--color-text-muted)]">{quote.customer_phone}</p>}
            {quote.customer_email && <p className="text-sm text-[var(--color-text-muted)]">{quote.customer_email}</p>}
            {quote.address && <p className="text-sm text-[var(--color-text-muted)] mt-1">Address: {quote.address}</p>}
          </div>
          <div className="p-3 rounded-lg border border-white/10 bg-black/20">
            <h3 className="font-semibold text-white">Totals</h3>
            <p className="text-sm">Total inc GST: ${quote.total_inc_gst.toFixed(2)}</p>
            <p className="text-sm">Deposit ({quote.deposit_percentage}%): ${quote.deposit_amount.toFixed(2)}</p>
            <p className="text-sm">Remaining balance: ${quote.remaining_balance.toFixed(2)}</p>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-white/10 bg-black/15 space-y-3">
          <h3 className="text-base font-semibold text-white">Scope</h3>
          <p className="text-sm text-[var(--color-text-muted)] capitalize">Service: {quote.service}</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {quote.bedrooms} bedrooms · {quote.bathrooms} bathrooms
          </p>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
            <div className="grid grid-cols-[2fr,1fr] text-xs uppercase tracking-wide text-[var(--color-text-muted)] border-b border-white/5">
              <div className="px-3 py-2">Item</div>
              <div className="px-3 py-2 text-right">Price (ex GST)</div>
            </div>
            <div className="divide-y divide-white/5">
              <div className="grid grid-cols-[2fr,1fr] items-center text-sm text-white">
                <div className="px-3 py-2">
                  {quote.service} · {quote.bedrooms} bed / {quote.bathrooms} bath
                </div>
                <div className="px-3 py-2 text-right font-semibold">
                  {computedPricing ? formatCurrency(computedPricing.mainPrice) : '-'}
                </div>
              </div>
              {addOnList.length === 0 && (quote.custom_addons || []).length === 0 ? (
                <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No add-ons selected.</div>
              ) : (
                <>
                  {addOnList.map((addon) => (
                    <div key={addon.key} className="grid grid-cols-[2fr,1fr] items-center text-sm text-white">
                      <div className="px-3 py-2">{addon.key.replace(/_/g, ' ')}</div>
                      <div className="px-3 py-2 text-right font-semibold">
                        {computedPricing ? formatCurrency((STANDARD_ADD_ONS[addon.key] || 0) * quote.hourly_rate) : '-'}
                      </div>
                    </div>
                  ))}
                  {(quote.custom_addons || []).map((addon, idx) => (
                    <div key={idx} className="grid grid-cols-[2fr,1fr] items-center text-sm text-white">
                      <div className="px-3 py-2">{addon.name || 'Custom add-on'}</div>
                      <div className="px-3 py-2 text-right font-semibold">
                        {formatCurrency(Number(addon.price || 0))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm pt-2">
            <span className="text-[var(--color-text-muted)]">Total (ex GST)</span>
            <span className="text-white font-semibold text-base">
              {computedPricing ? formatCurrency(computedPricing.totalEx) : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">Total (inc GST)</span>
            <span className="text-white font-semibold text-base">
              {computedPricing ? formatCurrency(computedPricing.totalInc) : '-'}
            </span>
          </div>
        </div>

        {(quote.notes || quote.description) && (
          <div className="p-4 rounded-lg border border-white/10 bg-black/20 space-y-2">
            <h3 className="text-base font-semibold text-white">Notes & Summary</h3>
            {quote.notes && <p className="text-sm text-[var(--color-text-muted)]">Notes: {quote.notes}</p>}
            {quote.description && <p className="text-sm text-white">Summary: {quote.description}</p>}
          </div>
        )
        }

        <div className="p-3 rounded-lg border border-white/10 bg-black/15 space-y-2">
          <h3 className="font-semibold text-white">Payment & compliance</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Entity: {entityName}</p>
          <p className="text-sm text-[var(--color-text-muted)]">Business Name: {businessOperatingName}</p>
          {businessAbn && <p className="text-sm text-[var(--color-text-muted)]">ABN: {businessAbn}</p>}
          <p className="text-sm text-[var(--color-text-muted)]">Reference: {quote.quote_number || 'Use quote number'}</p>
          <div className="text-xs text-[var(--color-text-muted)] pt-1">
            {hasBankDetails
              ? `Bank: BSB ${bankBsb} | Account ${bankAccountNumber} | Account Name: ${bankAccountName}`
              : 'Bank details will be provided upon acceptance.'}
            {hasBankDetails && (
              <button
                onClick={handleCopyBankDetails}
                className="ml-2 text-emerald-300 underline text-[11px]"
                type="button"
              >
                Copy bank details
              </button>
            )}
          </div>
          {quote.accepted_at ? (
            <div className="space-y-3">
              <div className="text-xs text-emerald-200">
                ✓ Accepted by {quote.accepted_name || 'customer'} on {quote.accepted_date || quote.accepted_at}
              </div>
              {paymentLoading && !paymentLinkUrl && (
                <button
                  disabled
                  className="w-full sm:w-auto rounded-lg bg-white/10 text-white/80 font-medium py-3 px-6 inline-flex items-center gap-2 border border-white/15 cursor-not-allowed"
                >
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M22 12a10 10 0 00-10-10v3a7 7 0 017 7h3z" />
                  </svg>
                  Preparing secure Stripe checkout...
                </button>
              )}
              {paymentLinkUrl && (
                <button
                  onClick={() => window.open(paymentLinkUrl, '_blank')}
                  className="w-full sm:w-auto rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-6 flex items-center justify-center gap-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Pay by Card · ${quote.total_inc_gst.toFixed(2)}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
              {paymentError && <div className="text-xs text-red-300">{paymentError}</div>}
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              <label className="text-xs text-[var(--color-text-muted)]">Name / Signature</label>
              <input
                type="text"
                value={acceptName}
                onChange={(e) => setAcceptName(e.target.value)}
                className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                placeholder="Type your full name"
              />
              <label className="text-xs text-[var(--color-text-muted)]">Date</label>
              <input
                type="date"
                value={acceptDate}
                onChange={(e) => setAcceptDate(e.target.value)}
                className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
              />
              <label className="inline-flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
                <input
                  type="checkbox"
                  checked={acceptChecked}
                  onChange={(e) => setAcceptChecked(e.target.checked)}
                />
                <span>
                  I accept this quote, authorize the work to proceed, and agree to pay the quoted amount. I will use the
                  quote number as payment reference.
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quote.accepted_payment_method === 'card_paid' ? (
                  <button
                    disabled
                    className="w-full rounded-lg bg-emerald-700/30 text-emerald-100 text-sm py-2 border border-emerald-500/40"
                  >
                    Paid
                  </button>
                ) : (
                  <button
                    onClick={() => handleAccept('direct_transfer')}
                    disabled={isAccepting}
                    className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2 disabled:opacity-60"
                  >
                    {isAccepting ? 'Recording…' : 'Accept & pay by direct transfer'}
                  </button>
                )}
                {quote.accepted_payment_method === 'card_paid' ? (
                  <button
                    disabled
                    className="w-full rounded-lg bg-emerald-700/30 text-emerald-100 text-sm py-2 border border-emerald-500/40"
                  >
                    Paid
                  </button>
                ) : (
                  <button
                    onClick={startCardPayment}
                    disabled={isAccepting || paymentLoading}
                    className="w-full rounded-lg bg-white/10 text-white text-sm py-2 disabled:opacity-60"
                  >
                    {paymentLoading ? 'Preparing secure checkout...' : 'Accept & pay by credit card'}
                  </button>
                )}
              </div>
            </div>
          )}
          {infoMessage && <div className="text-xs text-emerald-200">{infoMessage}</div>}
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          Generated by {businessName}. For questions, reply to this email or call us.
        </p>
      </div>

    </div>
  )
}

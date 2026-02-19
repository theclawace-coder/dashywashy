/**
 * OnboardingPage - Multi-step setup wizard
 * Guides new users through business details, branding, pricing, integrations, and team invites.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { GlassCard, Button, Input } from '../../components/ui'
import type { OrgRole } from '../../lib/types'

const STEPS = [
  'Business Details',
  'Branding & Locale',
  'Pricing Defaults',
  'Integrations',
  'Invite Team',
] as const
type StepIndex = 0 | 1 | 2 | 3 | 4

interface InviteRow {
  email: string
  role: OrgRole
}

const TIMEZONES = [
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne' },
  { value: 'Australia/Brisbane', label: 'Australia/Brisbane' },
  { value: 'Australia/Perth', label: 'Australia/Perth' },
  { value: 'Australia/Adelaide', label: 'Australia/Adelaide' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { currentOrg, reloadOrgData } = useAuth()
  const [step, setStep] = useState<StepIndex>(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

  // ---- Step 0: Business Details ----
  const [businessName, setBusinessName] = useState(currentOrg?.business_name ?? '')
  const [abn, setAbn] = useState(currentOrg?.business_abn ?? '')
  const [phone, setPhone] = useState(currentOrg?.business_phone ?? '')
  const [bizEmail, setBizEmail] = useState(currentOrg?.business_email ?? '')
  const [operatingName, setOperatingName] = useState(currentOrg?.business_operating_name ?? '')
  const [bankAccountName, setBankAccountName] = useState(currentOrg?.bank_account_name ?? '')
  const [bankBsb, setBankBsb] = useState(currentOrg?.bank_bsb ?? '')
  const [bankAccountNumber, setBankAccountNumber] = useState(currentOrg?.bank_account_number ?? '')

  // ---- Step 1: Branding & Locale ----
  const [logoUrl, setLogoUrl] = useState(currentOrg?.logo_url ?? '')
  const [primaryColor, setPrimaryColor] = useState(currentOrg?.primary_color ?? '#14b8a6')
  const [timezone, setTimezone] = useState(currentOrg?.timezone ?? 'Australia/Sydney')

  // ---- Step 2: Pricing ----
  const [clientRate, setClientRate] = useState(currentOrg?.default_client_hourly_rate?.toString() ?? '55')
  const [cleanerRate, setCleanerRate] = useState(currentOrg?.default_cleaner_hourly_rate?.toString() ?? '35')
  const [gstRate, setGstRate] = useState(currentOrg?.gst_rate?.toString() ?? '0.1')
  const [discountPct, setDiscountPct] = useState(currentOrg?.default_discount_pct?.toString() ?? '0')
  const [depositPct, setDepositPct] = useState(currentOrg?.default_deposit_pct?.toString() ?? '50')

  // ---- Step 3: Integrations ----
  const [stripeKey, setStripeKey] = useState('')
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('')
  const [dialpadKey, setDialpadKey] = useState('')
  const [dialpadUserId, setDialpadUserId] = useState('')
  const [outlookTenant, setOutlookTenant] = useState('')
  const [outlookClientId, setOutlookClientId] = useState('')
  const [outlookClientSecret, setOutlookClientSecret] = useState('')
  const [outlookUserEmail, setOutlookUserEmail] = useState('')
  const [resendKey, setResendKey] = useState('')
  const [resendFromEmail, setResendFromEmail] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [mapboxToken, setMapboxToken] = useState('')

  // ---- Step 4: Invite Team ----
  const [invites, setInvites] = useState<InviteRow[]>([{ email: '', role: 'staff' }])
  const [inviteSending, setInviteSending] = useState(false)

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const orgId = currentOrg?.id ?? createdOrgId

  const nextStep = () => setStep((s) => Math.min(s + 1, 4) as StepIndex)
  const prevStep = () => setStep((s) => Math.max(s - 1, 0) as StepIndex)

  // -------------------------------------------------------------------------
  // Save handlers per step
  // -------------------------------------------------------------------------

  const saveBusinessDetails = async () => {
    if (!businessName.trim()) {
      setError('Business name is required')
      return
    }
    setSaving(true)
    setError(null)

    if (!orgId) {
      // New user — create org via edge function
      const { data, error: err } = await supabase.functions.invoke('create-organization', {
        body: {
          name: businessName.trim(),
          business_name: businessName.trim(),
          business_phone: phone.trim() || undefined,
          business_email: bizEmail.trim() || undefined,
          business_abn: abn.trim() || undefined,
          business_operating_name: operatingName.trim() || undefined,
          bank_account_name: bankAccountName.trim() || undefined,
          bank_bsb: bankBsb.trim() || undefined,
          bank_account_number: bankAccountNumber.trim() || undefined,
        },
      })

      if (err || !data?.success) {
        setError(err?.message || data?.message || 'Failed to create organisation')
        setSaving(false)
        return
      }

      if (data?.organization?.id) {
        setCreatedOrgId(data.organization.id)
      }

      // Refresh auth context so currentOrg is populated
      await reloadOrgData()
      nextStep()
    } else {
      // Existing org — update details
      const { error: err } = await supabase
        .from('organizations')
        .update({
          business_name: businessName.trim(),
          business_abn: abn.trim() || null,
          business_phone: phone.trim() || null,
          business_email: bizEmail.trim() || null,
          business_operating_name: operatingName.trim() || null,
          bank_account_name: bankAccountName.trim() || null,
          bank_bsb: bankBsb.trim() || null,
          bank_account_number: bankAccountNumber.trim() || null,
          name: businessName.trim(),
        })
        .eq('id', orgId)

      if (err) {
        setError(err.message)
      } else {
        nextStep()
      }
    }
    setSaving(false)
  }

  const saveBranding = async () => {
    if (!orgId) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('organizations')
      .update({
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor || '#14b8a6',
        timezone,
      })
      .eq('id', orgId)

    if (err) {
      setError(err.message)
    } else {
      nextStep()
    }
    setSaving(false)
  }

  const savePricing = async () => {
    if (!orgId) return
    setSaving(true)
    setError(null)

    const parsedGst = parseFloat(gstRate)
    const normalizedGst =
      Number.isFinite(parsedGst) ? (parsedGst > 1 ? parsedGst / 100 : parsedGst) : 0.1

    const { error: err } = await supabase
      .from('organizations')
      .update({
        default_client_hourly_rate: parseFloat(clientRate) || 55,
        default_cleaner_hourly_rate: parseFloat(cleanerRate) || 35,
        gst_rate: normalizedGst,
        default_discount_pct: parseFloat(discountPct) || 0,
        default_deposit_pct: parseFloat(depositPct) || 50,
      })
      .eq('id', orgId)

    if (err) {
      setError(err.message)
    } else {
      nextStep()
    }
    setSaving(false)
  }

  const saveIntegrations = async () => {
    if (!orgId) return
    setSaving(true)
    setError(null)

    const integrations: { provider: string; config: Record<string, string> }[] = []

    if (stripeKey.trim()) {
      const config: Record<string, string> = { secret_key: stripeKey.trim() }
      if (stripeWebhookSecret.trim()) config.webhook_secret = stripeWebhookSecret.trim()
      integrations.push({ provider: 'stripe', config })
    }
    if (dialpadKey.trim()) {
      const config: Record<string, string> = { api_key: dialpadKey.trim() }
      if (dialpadUserId.trim()) config.user_id = dialpadUserId.trim()
      integrations.push({ provider: 'dialpad', config })
    }
    if (outlookTenant.trim() || outlookClientId.trim()) {
      integrations.push({
        provider: 'outlook',
        config: {
          tenant_id: outlookTenant.trim(),
          client_id: outlookClientId.trim(),
          client_secret: outlookClientSecret.trim(),
          user_email: outlookUserEmail.trim(),
        },
      })
    }
    if (resendKey.trim()) {
      const config: Record<string, string> = { api_key: resendKey.trim() }
      if (resendFromEmail.trim()) config.from_email = resendFromEmail.trim()
      integrations.push({ provider: 'resend', config })
    }
    if (openaiKey.trim()) {
      integrations.push({ provider: 'openai', config: { api_key: openaiKey.trim() } })
    }
    if (mapboxToken.trim()) {
      integrations.push({ provider: 'mapbox', config: { token: mapboxToken.trim() } })
    }

    for (const integration of integrations) {
      const { error: err } = await supabase
        .from('organization_integrations')
        .upsert(
          { org_id: orgId, provider: integration.provider, config: integration.config, enabled: true },
          { onConflict: 'org_id,provider' }
        )

      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    }

    nextStep()
    setSaving(false)
  }

  const sendInvites = async () => {
    const validInvites = invites.filter((inv) => inv.email.trim())
    if (validInvites.length === 0) {
      navigate('/app')
      return
    }

    setInviteSending(true)
    setError(null)

    for (const inv of validInvites) {
      const { error: err } = await supabase.functions.invoke('send-invite', {
        body: {
          org_id: orgId,
          email: inv.email.trim(),
          role: inv.role,
        },
      })

      if (err) {
        setError(`Failed to invite ${inv.email}: ${err.message}`)
        setInviteSending(false)
        return
      }
    }

    setInviteSending(false)
    navigate('/app')
  }

  const addInviteRow = () => setInvites((prev) => [...prev, { email: '', role: 'staff' }])
  const removeInviteRow = (index: number) =>
    setInvites((prev) => prev.filter((_, i) => i !== index))
  const updateInviteRow = (index: number, field: keyof InviteRow, value: string) =>
    setInvites((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i as StepIndex)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  i === step
                    ? 'bg-[var(--color-accent)] text-[var(--color-void)] shadow-lg shadow-teal-500/25'
                    : i < step
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] cursor-pointer'
                    : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]'
                }`}
              >
                {i < step ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-6 h-0.5 rounded-full transition-colors ${
                    i < step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-elevated)]'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-micro mb-4">{STEPS[step]}</p>

        <GlassCard className="p-8">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* ---- Step 0: Business Details ---- */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-heading text-white mb-1">Tell us about your business</h2>
                <p className="text-caption">This information appears on your quotes, invoices, and customer-facing pages.</p>
              </div>
              <Input label="BUSINESS NAME" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme Cleaning Co." required />
              <Input label="ABN" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="12 345 678 901" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="PHONE" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0400 000 000" />
                <Input label="EMAIL" type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} placeholder="hello@acme.com" />
              </div>
              <Input label="OPERATING / TRADING NAME" value={operatingName} onChange={(e) => setOperatingName(e.target.value)} placeholder="Optional alternative name" />
              <div className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-4">
                <p className="text-micro text-[var(--color-text-muted)]">BANK DETAILS (FOR DIRECT TRANSFER)</p>
                <Input label="ACCOUNT NAME" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Business account name" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="BSB" value={bankBsb} onChange={(e) => setBankBsb(e.target.value)} placeholder="062-000" />
                  <Input label="ACCOUNT NUMBER" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="12345678" />
                </div>
              </div>
            </div>
          )}

          {/* ---- Step 1: Branding & Locale ---- */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-heading text-white mb-1">Branding & locale</h2>
                <p className="text-caption">Personalise your CRM with your brand colours and set your timezone.</p>
              </div>

              <Input label="LOGO URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />

              {logoUrl.trim() && (
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-center overflow-hidden">
                    <img src={logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">Logo preview</p>
                </div>
              )}

              <div>
                <label className="text-micro block mb-1.5">PRIMARY COLOUR</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-[var(--glass-border)] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="input flex-1"
                    placeholder="#14b8a6"
                  />
                </div>
              </div>

              <div>
                <label className="text-micro block mb-1.5">TIMEZONE</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input w-full">
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ---- Step 2: Pricing Defaults ---- */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-heading text-white mb-1">Set your pricing defaults</h2>
                <p className="text-caption">These are used when creating new quotes. You can always override them per job.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="CLIENT HOURLY RATE ($)" type="number" min="0" step="0.01" value={clientRate} onChange={(e) => setClientRate(e.target.value)} />
                <Input label="CLEANER HOURLY RATE ($)" type="number" min="0" step="0.01" value={cleanerRate} onChange={(e) => setCleanerRate(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="GST RATE (decimal, e.g. 0.1)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                />
                <Input label="DEFAULT DISCOUNT (%)" type="number" min="0" step="0.1" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
                <Input label="DEPOSIT (%)" type="number" min="0" step="1" value={depositPct} onChange={(e) => setDepositPct(e.target.value)} />
              </div>
            </div>
          )}

          {/* ---- Step 3: Integrations ---- */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-heading text-white mb-1">Connect your tools</h2>
                <p className="text-caption">
                  These are optional. You can always set them up later in Settings &rarr; Integrations.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-sm font-medium text-white mb-3">Stripe (Payments)</p>
                  <div className="space-y-3">
                    <Input label="SECRET KEY" value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} placeholder="sk_live_..." />
                    <Input label="WEBHOOK SECRET" value={stripeWebhookSecret} onChange={(e) => setStripeWebhookSecret(e.target.value)} placeholder="whsec_..." />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-sm font-medium text-white mb-3">Dialpad (Calls & SMS)</p>
                  <div className="space-y-3">
                    <Input label="API KEY" value={dialpadKey} onChange={(e) => setDialpadKey(e.target.value)} placeholder="dp_..." />
                    <Input label="USER ID (OPTIONAL)" value={dialpadUserId} onChange={(e) => setDialpadUserId(e.target.value)} placeholder="Dialpad user ID" />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-sm font-medium text-white mb-3">Outlook (Email Sync)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="TENANT ID" value={outlookTenant} onChange={(e) => setOutlookTenant(e.target.value)} placeholder="Azure AD Tenant ID" />
                    <Input label="CLIENT ID" value={outlookClientId} onChange={(e) => setOutlookClientId(e.target.value)} placeholder="App Registration Client ID" />
                    <Input label="CLIENT SECRET" type="password" value={outlookClientSecret} onChange={(e) => setOutlookClientSecret(e.target.value)} placeholder="Client secret value" />
                    <Input label="USER EMAIL" type="email" value={outlookUserEmail} onChange={(e) => setOutlookUserEmail(e.target.value)} placeholder="user@yourdomain.com" />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-sm font-medium text-white mb-3">Resend (Transactional Email)</p>
                  <div className="space-y-3">
                    <Input label="API KEY" value={resendKey} onChange={(e) => setResendKey(e.target.value)} placeholder="re_..." />
                    <Input label="FROM EMAIL" value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="noreply@yourdomain.com" />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-sm font-medium text-white mb-3">OpenAI (AI Features)</p>
                  <Input label="API KEY" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." />
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-sm font-medium text-white mb-3">Mapbox (Maps & Dispatch)</p>
                  <Input label="PUBLIC TOKEN" value={mapboxToken} onChange={(e) => setMapboxToken(e.target.value)} placeholder="pk.ey..." />
                </div>
              </div>
            </div>
          )}

          {/* ---- Step 4: Invite Team ---- */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-heading text-white mb-1">Invite your team</h2>
                <p className="text-caption">Add team members now or skip and invite them later from the Team settings page.</p>
              </div>

              <div className="space-y-3">
                {invites.map((inv, index) => (
                  <div key={index} className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'EMAIL' : undefined}
                        type="email"
                        value={inv.email}
                        onChange={(e) => updateInviteRow(index, 'email', e.target.value)}
                        placeholder="teammate@company.com"
                      />
                    </div>
                    <div className="w-32">
                      {index === 0 && <label className="text-micro block mb-1.5">ROLE</label>}
                      <select
                        value={inv.role}
                        onChange={(e) => updateInviteRow(index, 'role', e.target.value)}
                        className="input"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="staff">Staff</option>
                        <option value="cleaner">Cleaner</option>
                      </select>
                    </div>
                    {invites.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInviteRow(index)}
                        className="pb-2 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addInviteRow}
                className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-medium"
              >
                + Add another
              </button>
            </div>
          )}

          {/* ---- Navigation buttons ---- */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--glass-border)]">
            <div>
              {step > 0 && (
                <Button variant="ghost" onClick={prevStep}>
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Skip for optional steps */}
              {(step === 1 || step === 3 || step === 4) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (step === 4) {
                      navigate('/app')
                    } else {
                      nextStep()
                    }
                  }}
                >
                  Skip
                </Button>
              )}

              {step === 0 && (
                <Button variant="primary" onClick={saveBusinessDetails} loading={saving}>
                  Next
                </Button>
              )}
              {step === 1 && (
                <Button variant="primary" onClick={saveBranding} loading={saving}>
                  Next
                </Button>
              )}
              {step === 2 && (
                <Button variant="primary" onClick={savePricing} loading={saving}>
                  Next
                </Button>
              )}
              {step === 3 && (
                <Button variant="primary" onClick={saveIntegrations} loading={saving}>
                  Next
                </Button>
              )}
              {step === 4 && (
                <Button variant="primary" onClick={sendInvites} loading={inviteSending}>
                  {invites.some((i) => i.email.trim()) ? 'Send Invites & Finish' : 'Go to Dashboard'}
                </Button>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

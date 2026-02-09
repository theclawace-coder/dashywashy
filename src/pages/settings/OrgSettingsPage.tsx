/**
 * OrgSettingsPage - Edit organization business details, pricing, and branding.
 * Only accessible by owner/admin roles.
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input, Badge } from '../../components/ui'

export default function OrgSettingsPage() {
  const { currentOrg, hasRole } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Business details
  const [businessName, setBusinessName] = useState('')
  const [abn, setAbn] = useState('')
  const [phone, setPhone] = useState('')
  const [bizEmail, setBizEmail] = useState('')
  const [operatingName, setOperatingName] = useState('')
  const [timezone, setTimezone] = useState('Australia/Sydney')
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankBsb, setBankBsb] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')

  // Pricing
  const [clientRate, setClientRate] = useState('')
  const [cleanerRate, setCleanerRate] = useState('')
  const [gstRate, setGstRate] = useState('')
  const [discountPct, setDiscountPct] = useState('')
  const [depositPct, setDepositPct] = useState('')

  // Branding
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#14b8a6')

  useEffect(() => {
    if (!currentOrg) return
    setBusinessName(currentOrg.business_name ?? '')
    setAbn(currentOrg.business_abn ?? '')
    setPhone(currentOrg.business_phone ?? '')
    setBizEmail(currentOrg.business_email ?? '')
    setOperatingName(currentOrg.business_operating_name ?? '')
    setTimezone(currentOrg.timezone ?? 'Australia/Sydney')
    setBankAccountName(currentOrg.bank_account_name ?? '')
    setBankBsb(currentOrg.bank_bsb ?? '')
    setBankAccountNumber(currentOrg.bank_account_number ?? '')
    setClientRate(currentOrg.default_client_hourly_rate?.toString() ?? '60')
    setCleanerRate(currentOrg.default_cleaner_hourly_rate?.toString() ?? '35')
    setGstRate(currentOrg.gst_rate?.toString() ?? '0.1')
    setDiscountPct(currentOrg.default_discount_pct?.toString() ?? '10')
    setDepositPct(currentOrg.default_deposit_pct?.toString() ?? '0')
    setLogoUrl(currentOrg.logo_url ?? '')
    setPrimaryColor(currentOrg.primary_color ?? '#14b8a6')
  }, [currentOrg])

  const handleSave = async () => {
    if (!currentOrg) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const { error: err } = await supabase
      .from('organizations')
      .update({
        name: businessName.trim(),
        business_name: businessName.trim(),
        business_abn: abn.trim() || null,
        business_phone: phone.trim() || null,
        business_email: bizEmail.trim() || null,
        business_operating_name: operatingName.trim() || null,
        bank_account_name: bankAccountName.trim() || null,
        bank_bsb: bankBsb.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        timezone,
        default_client_hourly_rate: parseFloat(clientRate) || 60,
        default_cleaner_hourly_rate: parseFloat(cleanerRate) || 35,
        gst_rate: parseFloat(gstRate) || 0.1,
        default_discount_pct: parseFloat(discountPct) || 0,
        default_deposit_pct: parseFloat(depositPct) || 0,
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor || '#14b8a6',
      })
      .eq('id', currentOrg.id)

    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  if (!hasRole('admin')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">You need admin or owner access to view organization settings.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title text-white">Organization Settings</h1>
          <p className="text-caption mt-1">Manage your business details, pricing, and branding.</p>
        </div>
        <Badge variant="info">{currentOrg?.plan ?? 'free'}</Badge>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-sm text-emerald-400">Settings saved successfully.</p>
        </div>
      )}

      {/* Business Details */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Business Details</h2>
        <div className="space-y-4">
          <Input label="BUSINESS NAME" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="My Cleaning Co." />
          <Input label="ABN" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="12 345 678 901" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="PHONE" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0400 000 000" />
            <Input label="EMAIL" type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} placeholder="hello@business.com" />
          </div>
          <Input label="OPERATING / TRADING NAME" value={operatingName} onChange={(e) => setOperatingName(e.target.value)} placeholder="Optional" />
          <div className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-4">
            <p className="text-micro text-[var(--color-text-muted)]">BANK DETAILS (FOR DIRECT TRANSFER)</p>
            <Input label="ACCOUNT NAME" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Business account name" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="BSB" value={bankBsb} onChange={(e) => setBankBsb(e.target.value)} placeholder="062-000" />
              <Input label="ACCOUNT NUMBER" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="12345678" />
            </div>
          </div>
          <div>
            <label className="text-micro block mb-1.5">TIMEZONE</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input w-full">
              <option value="Australia/Sydney">Australia/Sydney</option>
              <option value="Australia/Melbourne">Australia/Melbourne</option>
              <option value="Australia/Brisbane">Australia/Brisbane</option>
              <option value="Australia/Perth">Australia/Perth</option>
              <option value="Australia/Adelaide">Australia/Adelaide</option>
              <option value="Pacific/Auckland">Pacific/Auckland</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Pricing Defaults */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Pricing Defaults</h2>
        <p className="text-caption mb-4">Used when creating new quotes. Can be overridden per job.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="CLIENT HOURLY RATE ($)" type="number" min="0" step="0.01" value={clientRate} onChange={(e) => setClientRate(e.target.value)} />
          <Input label="CLEANER HOURLY RATE ($)" type="number" min="0" step="0.01" value={cleanerRate} onChange={(e) => setCleanerRate(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <Input label="GST RATE (decimal, e.g. 0.1)" type="number" min="0" step="0.01" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
          <Input label="DEFAULT DISCOUNT (%)" type="number" min="0" step="0.1" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          <Input label="DEPOSIT (%)" type="number" min="0" step="1" value={depositPct} onChange={(e) => setDepositPct(e.target.value)} />
        </div>
      </GlassCard>

      {/* Branding */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Branding</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="LOGO URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          <div>
            <label className="text-micro block mb-1.5">PRIMARY COLOR</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--glass-border)] bg-transparent cursor-pointer" />
              <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="input flex-1" placeholder="#14b8a6" />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Plan Info */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-2">Plan</h2>
        <div className="flex items-center gap-3">
          <Badge variant="info">{currentOrg?.plan ?? 'free'}</Badge>
          <span className="text-caption">
            {currentOrg?.max_users ?? 5} users, {currentOrg?.max_cleaners ?? 10} cleaners
          </span>
        </div>
      </GlassCard>

      {/* Save */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}

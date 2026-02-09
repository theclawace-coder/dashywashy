/**
 * CleanerInvitePage - Public cleaner self-intake via one-time invite link.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input, Badge, Skeleton } from '../../components/ui'

type AvailabilityBucket = 'Morning' | 'Afternoon' | 'Evening' | 'Night'
type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

const DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const BUCKETS: AvailabilityBucket[] = ['Morning', 'Afternoon', 'Evening', 'Night']

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_API_KEY || import.meta.env.VITE_MAPBOX || ''

async function mapboxSuggest(query: string) {
  if (!MAPBOX_TOKEN) return []
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5&country=AU`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  const features = Array.isArray(data?.features) ? data.features : []
  return features
    .map((f: any) => ({ place_name: f?.place_name as string, center: f?.center as [number, number] | undefined }))
    .filter((x: any) => typeof x.place_name === 'string' && x.place_name.length > 0)
}

function defaultAvailability() {
  const base: Record<string, Record<string, boolean>> = {}
  for (const d of DAYS) {
    base[d] = { Morning: false, Afternoon: false, Evening: false, Night: false }
  }
  return base
}

export default function CleanerInvitePage() {
  const { token } = useParams<{ token: string }>()
  const [inviteLoading, setInviteLoading] = useState(true)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('Our Team')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState(() => ({
    full_name: '',
    phone: '',
    email: '',
    base_location_text: '',
    base_lat: null as number | null,
    base_lng: null as number | null,
    abn: '',
    bank_account_name: '',
    bank_bsb: '',
    bank_account_number: '',
    min_booking_minutes: 120,
    notice_hours: 24,
    cancellation_policy: '',
    has_transport: false,
    transport_type: 'car',
    max_travel_km: 15,
    can_transport_equipment: false,
    public_liability_policy_number: '',
    public_liability_expiry: '',
    team_size: 1,
    ratesText: '{"standard":45}',
    availability: defaultAvailability() as Record<DayName, Record<AvailabilityBucket, boolean>>,
  }))

  const [locationResults, setLocationResults] = useState<{ place_name: string; center?: [number, number] }[]>([])

  useEffect(() => {
    if (!token) {
      setInviteError('Invite token missing.')
      setInviteLoading(false)
      return
    }

    async function loadInvite() {
      const { data, error } = await supabase.functions.invoke('get-cleaner-invite', {
        body: { token },
      })

      if (error || !data?.invite) {
        setInviteError(error?.message || 'This invite link is invalid or has expired.')
      } else {
        setOrgName(data.organization?.name || 'Our Team')
        setExpiresAt(data.invite?.expires_at || null)
      }
      setInviteLoading(false)
    }

    loadInvite()
  }, [token])

  const toggleAvailability = (day: DayName, bucket: AvailabilityBucket) => {
    setForm((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: { ...prev.availability[day], [bucket]: !prev.availability[day][bucket] },
      },
    }))
  }

  const handleLocationSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 3) {
      setLocationResults([])
      return
    }
    try {
      const results = await mapboxSuggest(q.trim())
      setLocationResults(results)
    } catch {
      setLocationResults([])
    }
  }, [])

  const expiresText = useMemo(() => {
    if (!expiresAt) return null
    return new Date(expiresAt).toLocaleString()
  }, [expiresAt])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.full_name.trim()) {
      setFormError('Please enter your full name.')
      return
    }

    let rates: Record<string, number> = {}
    try {
      rates = form.ratesText ? JSON.parse(form.ratesText) : {}
    } catch {
      setFormError('Rates must be valid JSON (e.g. {"standard":45}).')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.functions.invoke('submit-cleaner-invite', {
      body: {
        token,
        cleaner: {
          ...form,
          rates,
        },
      },
    })

    if (error) {
      setFormError(error.message || 'Failed to submit. Please try again.')
    } else {
      setSubmitted(true)
    }

    setSubmitting(false)
  }

  if (inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-lg p-8">
          <div className="space-y-4">
            <Skeleton width="60%" height={24} />
            <Skeleton width="100%" height={16} />
            <Skeleton width="100%" height={48} />
          </div>
        </GlassCard>
      </div>
    )
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-lg p-8 text-center">
          <h1 className="text-title text-white mb-2">Invite not valid</h1>
          <p className="text-caption">{inviteError}</p>
        </GlassCard>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-lg p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[var(--color-success-muted)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-title text-white mb-2">Details received</h1>
          <p className="text-caption">
            Thanks! Your details have been sent to <span className="text-white font-medium">{orgName}</span>.
          </p>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <GlassCard className="p-6 md:p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <h1 className="text-title text-white mb-2">Join {orgName}</h1>
            <p className="text-caption mb-3">Please fill in your details below to complete your cleaner profile.</p>
            <Badge variant="info">One-time invite</Badge>
            {expiresText && (
              <p className="text-xs text-[var(--color-text-muted)] mt-2">Expires {expiresText}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              placeholder="Enter full name"
              required
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="Phone number"
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email address"
            />
            <Input
              label="Team Size"
              type="number"
              min={1}
              value={form.team_size}
              onChange={(e) => setForm((p) => ({ ...p, team_size: Number(e.target.value) }))}
            />

            <div className="md:col-span-2">
              <Input
                label="Base Location"
                value={form.base_location_text}
                onChange={(e) => {
                  setForm((p) => ({ ...p, base_location_text: e.target.value, base_lat: null, base_lng: null }))
                  handleLocationSearch(e.target.value)
                }}
                placeholder="Search suburb/area..."
              />
              {typeof form.base_lat === 'number' && typeof form.base_lng === 'number' && (
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Pinned: {form.base_lat.toFixed(5)}, {form.base_lng.toFixed(5)}
                </p>
              )}
              {locationResults.length > 0 && (
                <div className="mt-2 rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--color-surface)]">
                  {locationResults.map((r) => (
                    <button
                      key={r.place_name}
                      type="button"
                      onClick={() => {
                        setForm((p) => ({
                          ...p,
                          base_location_text: r.place_name,
                          base_lng: r.center?.[0] ?? null,
                          base_lat: r.center?.[1] ?? null,
                        }))
                        setLocationResults([])
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[var(--color-surface-hover)] border-b border-[var(--glass-border)] last:border-b-0"
                    >
                      {r.place_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Input
              label="ABN"
              value={form.abn}
              onChange={(e) => setForm((p) => ({ ...p, abn: e.target.value }))}
              placeholder="Australian Business Number"
            />

            <div className="md:col-span-2">
              <label className="text-micro mb-2 block">Bank Details</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={form.bank_account_name}
                  onChange={(e) => setForm((p) => ({ ...p, bank_account_name: e.target.value }))}
                  placeholder="Account name"
                  className="input"
                />
                <input
                  value={form.bank_bsb}
                  onChange={(e) => setForm((p) => ({ ...p, bank_bsb: e.target.value }))}
                  placeholder="BSB"
                  className="input"
                />
                <input
                  value={form.bank_account_number}
                  onChange={(e) => setForm((p) => ({ ...p, bank_account_number: e.target.value }))}
                  placeholder="Account number"
                  className="input"
                />
              </div>
            </div>

            <Input
              label="Min Booking (minutes)"
              type="number"
              min={30}
              step={30}
              value={form.min_booking_minutes}
              onChange={(e) => setForm((p) => ({ ...p, min_booking_minutes: Number(e.target.value) }))}
            />
            <Input
              label="Notice Required (hours)"
              type="number"
              min={0}
              value={form.notice_hours}
              onChange={(e) => setForm((p) => ({ ...p, notice_hours: Number(e.target.value) }))}
            />

            <div className="md:col-span-2">
              <label className="text-micro mb-2 block">Rates (JSON)</label>
              <textarea
                value={form.ratesText}
                onChange={(e) => setForm((p) => ({ ...p, ratesText: e.target.value }))}
                rows={2}
                className="input w-full font-mono text-sm"
                placeholder='{"standard": 45, "end_of_lease": 55}'
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-micro mb-3 block">Availability</label>
              <div className="rounded-2xl overflow-hidden border border-[var(--glass-border)]">
                <div className="grid grid-cols-5 gap-0 bg-[var(--color-surface-elevated)]">
                  <div className="p-3 text-xs text-[var(--color-text-muted)]">Day</div>
                  {BUCKETS.map((b) => (
                    <div key={b} className="p-3 text-xs text-[var(--color-text-muted)] text-center">{b}</div>
                  ))}
                </div>
                {DAYS.map((d) => (
                  <div key={d} className="grid grid-cols-5 gap-0 border-t border-[var(--glass-border)]">
                    <div className="p-3 text-sm text-white/90">{d.slice(0, 3)}</div>
                    {BUCKETS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleAvailability(d, b)}
                        className={`p-3 text-center transition-all ${
                          form.availability?.[d]?.[b]
                            ? 'bg-cyan-500/30 text-cyan-200 font-medium'
                            : 'bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
                        }`}
                      >
                        {form.availability?.[d]?.[b] ? 'Y' : '-'}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-micro mb-3 block">Transport & Travel</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--glass-border)] cursor-pointer hover:bg-[var(--color-surface-hover)]">
                  <input
                    type="checkbox"
                    checked={form.has_transport}
                    onChange={(e) => setForm((p) => ({ ...p, has_transport: e.target.checked }))}
                    className="accent-cyan-500"
                  />
                  <span className="text-sm text-white">Has transport</span>
                </label>
                <select
                  value={form.transport_type}
                  onChange={(e) => setForm((p) => ({ ...p, transport_type: e.target.value }))}
                  className="input"
                >
                  <option value="car">Car</option>
                  <option value="public_transport">Public Transport</option>
                  <option value="bike">Bike</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={form.max_travel_km}
                  onChange={(e) => setForm((p) => ({ ...p, max_travel_km: Number(e.target.value) }))}
                  className="input"
                  placeholder="Max km"
                />
                <label className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--glass-border)] cursor-pointer hover:bg-[var(--color-surface-hover)]">
                  <input
                    type="checkbox"
                    checked={form.can_transport_equipment}
                    onChange={(e) => setForm((p) => ({ ...p, can_transport_equipment: e.target.checked }))}
                    className="accent-cyan-500"
                  />
                  <span className="text-sm text-white">Can carry equipment</span>
                </label>
              </div>
            </div>

            <Input
              label="Public Liability Policy #"
              value={form.public_liability_policy_number}
              onChange={(e) => setForm((p) => ({ ...p, public_liability_policy_number: e.target.value }))}
              placeholder="Policy number"
            />
            <Input
              label="Policy Expiry"
              type="date"
              value={form.public_liability_expiry}
              onChange={(e) => setForm((p) => ({ ...p, public_liability_expiry: e.target.value }))}
            />

            <div className="md:col-span-2">
              <label className="text-micro mb-2 block">Cancellation Policy</label>
              <textarea
                value={form.cancellation_policy}
                onChange={(e) => setForm((p) => ({ ...p, cancellation_policy: e.target.value }))}
                rows={2}
                className="input w-full"
                placeholder="Cancellation policy notes..."
              />
            </div>

            {formError && (
              <div className="md:col-span-2 p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
                <p className="text-sm text-red-400">{formError}</p>
              </div>
            )}

            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" variant="primary" loading={submitting}>
                Submit Details
              </Button>
            </div>
          </form>
        </GlassCard>
      </div>
    </div>
  )
}

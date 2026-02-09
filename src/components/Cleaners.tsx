/**
 * Cleaners - Apple VisionOS Team Management
 * 
 * A beautiful interface for managing your cleaning team.
 * Glass cards, availability matrix, and smooth interactions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { playSaveSound } from '../lib/sounds'
import { useAuth } from '../lib/auth'
import { GlassCard, Button, Badge, useToast, Input, Modal } from './ui'

type AvailabilityBucket = 'Morning' | 'Afternoon' | 'Evening' | 'Night'
type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

type Cleaner = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  base_location_text: string | null
  base_lat: number | null
  base_lng: number | null
  abn: string | null
  bank_account_name: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  rates: Record<string, number> | null
  min_booking_minutes: number | null
  notice_hours: number | null
  cancellation_policy: string | null
  has_transport: boolean | null
  transport_type: string | null
  max_travel_km: number | null
  can_transport_equipment: boolean | null
  public_liability_policy_number: string | null
  public_liability_expiry: string | null
  team_size: number | null
  availability: any
  active: boolean | null
}

const DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const BUCKETS: AvailabilityBucket[] = ['Morning', 'Afternoon', 'Evening', 'Night']

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_API_KEY || import.meta.env.VITE_MAPBOX || ''

async function mapboxSuggest(query: string) {
  if (!MAPBOX_TOKEN) return []
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5&country=AU`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  const features = Array.isArray(data?.features) ? data.features : []
  return features.map((f: any) => ({ place_name: f?.place_name as string, center: f?.center as [number, number] | undefined })).filter((x: any) => typeof x.place_name === 'string' && x.place_name.length > 0)
}

function defaultAvailability() {
  const base: Record<string, Record<string, boolean>> = {}
  for (const d of DAYS) {
    base[d] = { Morning: false, Afternoon: false, Evening: false, Night: false }
  }
  return base
}

export default function Cleaners() {
  const { hasRole, currentOrg } = useAuth()
  const { addToast } = useToast()
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null)

  const selected = useMemo(() => cleaners.find((c) => c.id === selectedId) || null, [cleaners, selectedId])

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
    active: true,
  }))

  const [locationResults, setLocationResults] = useState<{ place_name: string; center?: [number, number] }[]>([])

  const fetchCleaners = useCallback(async () => {
    setIsLoading(true)
    try {
      if (!currentOrg?.id) {
        setCleaners([])
        return
      }
      const { data, error: err } = await supabase
        .from('cleaners')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false })
        .limit(500)
      if (err) throw err
      setCleaners((data || []) as any)
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to load cleaners', message: e?.message })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, currentOrg?.id])

  useEffect(() => {
    fetchCleaners()
  }, [fetchCleaners])

  const startNew = () => {
    setSelectedId(null)
    setForm({
      full_name: '',
      phone: '',
      email: '',
      base_location_text: '',
      base_lat: null,
      base_lng: null,
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
      availability: defaultAvailability(),
      active: true,
    })
    setLocationResults([])
  }

  const loadIntoForm = (c: Cleaner) => {
    setSelectedId(c.id)
    setForm({
      full_name: c.full_name || '',
      phone: c.phone || '',
      email: c.email || '',
      base_location_text: c.base_location_text || '',
      base_lat: c.base_lat ?? null,
      base_lng: c.base_lng ?? null,
      abn: c.abn || '',
      bank_account_name: c.bank_account_name || '',
      bank_bsb: c.bank_bsb || '',
      bank_account_number: c.bank_account_number || '',
      min_booking_minutes: c.min_booking_minutes ?? 120,
      notice_hours: c.notice_hours ?? 24,
      cancellation_policy: c.cancellation_policy || '',
      has_transport: Boolean(c.has_transport),
      transport_type: c.transport_type || 'car',
      max_travel_km: c.max_travel_km ?? 15,
      can_transport_equipment: Boolean(c.can_transport_equipment),
      public_liability_policy_number: c.public_liability_policy_number || '',
      public_liability_expiry: c.public_liability_expiry || '',
      team_size: c.team_size ?? 1,
      ratesText: JSON.stringify(c.rates || {}, null, 0) || '{"standard":45}',
      availability: (c.availability as any) || defaultAvailability(),
      active: c.active !== false,
    })
    setLocationResults([])
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

  const toggleAvailability = (day: DayName, bucket: AvailabilityBucket) => {
    setForm((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: { ...prev.availability[day], [bucket]: !prev.availability[day][bucket] },
      },
    }))
  }

  const saveCleaner = async () => {
    if (!currentOrg?.id) {
      addToast({ type: 'error', title: 'No organization selected', message: 'Please select an organization and try again.' })
      return
    }

    let rates: any = {}
    try {
      rates = form.ratesText ? JSON.parse(form.ratesText) : {}
    } catch {
      addToast({ type: 'error', title: 'Invalid rates JSON', message: 'Rates must be valid JSON (e.g. {"standard":45})' })
      return
    }

    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      base_location_text: form.base_location_text.trim() || null,
      base_lat: form.base_lat,
      base_lng: form.base_lng,
      abn: form.abn.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      bank_bsb: form.bank_bsb.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      min_booking_minutes: Number(form.min_booking_minutes) || 120,
      notice_hours: Number(form.notice_hours) || 24,
      cancellation_policy: form.cancellation_policy.trim() || null,
      has_transport: Boolean(form.has_transport),
      transport_type: form.transport_type.trim() || null,
      max_travel_km: Number(form.max_travel_km) || 15,
      can_transport_equipment: Boolean(form.can_transport_equipment),
      public_liability_policy_number: form.public_liability_policy_number.trim() || null,
      public_liability_expiry: form.public_liability_expiry || null,
      team_size: Number(form.team_size) || 1,
      rates,
      availability: form.availability,
      active: Boolean(form.active),
    }

    if (!payload.full_name) {
      addToast({ type: 'warning', title: 'Name required', message: 'Please enter a full name' })
      return
    }

    setSaving(true)
    try {
      if (selectedId) {
        const { error: err } = await supabase
          .from('cleaners')
          .update(payload)
          .eq('id', selectedId)
          .eq('org_id', currentOrg.id)
        if (err) throw err
        addToast({ type: 'success', title: '✅ Cleaner updated!' })
      } else {
        const { data, error: err } = await supabase
          .from('cleaners')
          .insert({ ...payload, org_id: currentOrg.id })
          .select('id')
          .single()
        if (err) throw err
        if (data?.id) setSelectedId(data.id)
        addToast({ type: 'success', title: '✅ Cleaner added!' })
      }
      await fetchCleaners()
      playSaveSound()
    } catch (e: any) {
      addToast({ type: 'error', title: 'Save failed', message: e?.message })
    } finally {
      setSaving(false)
    }
  }

  const deleteCleaner = async () => {
    if (!selectedId) return
    if (!confirm('Delete this cleaner?')) return
    try {
      if (!currentOrg?.id) {
        addToast({ type: 'error', title: 'No organization selected', message: 'Please select an organization and try again.' })
        return
      }
      const { error: err } = await supabase
        .from('cleaners')
        .delete()
        .eq('id', selectedId)
        .eq('org_id', currentOrg.id)
      if (err) throw err
      addToast({ type: 'success', title: 'Cleaner deleted' })
      startNew()
      await fetchCleaners()
    } catch (e: any) {
      addToast({ type: 'error', title: 'Delete failed', message: e?.message })
    }
  }

  const activeCleaners = cleaners.filter(c => c.active !== false)
  const inactiveCleaners = cleaners.filter(c => c.active === false)

  const createInviteLink = async () => {
    setInviteLoading(true)
    const { data, error } = await supabase.functions.invoke('create-cleaner-invite', { body: {} })
    if (error) {
      addToast({ type: 'error', title: 'Invite failed', message: error.message })
      setInviteLoading(false)
      return
    }
    const link = (data as any)?.invite?.invite_url as string | undefined
    const expiry = (data as any)?.invite?.expires_at as string | undefined
    if (!link) {
      addToast({ type: 'error', title: 'Invite failed', message: 'No invite link returned' })
      setInviteLoading(false)
      return
    }
    setInviteLink(link)
    setInviteExpiry(expiry || null)
    setInviteOpen(true)
    setInviteLoading(false)
  }

  const copyInviteLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      addToast({ type: 'success', title: 'Link copied', message: 'Invite link copied to clipboard.' })
    } catch {
      addToast({ type: 'error', title: 'Copy failed', message: 'Unable to copy link.' })
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-title text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                Team Management
              </h1>
              <p className="text-caption mt-1">Manage your cleaning team's availability, rates, and details</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {hasRole('manager') && (
                <Button onClick={createInviteLink} loading={inviteLoading} variant="secondary">
                  Create Invite Link
                </Button>
              )}
              <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{activeCleaners.length}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Active</p>
                </div>
                <div className="w-px h-8 bg-[var(--glass-border)]" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-[var(--color-text-muted)]">{inactiveCleaners.length}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Inactive</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cleaners List */}
          <GlassCard className="overflow-hidden">
            <div className="p-4 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h2 className="text-heading text-white">All Cleaners</h2>
              <Button onClick={startNew} variant="primary" size="sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add New
              </Button>
            </div>

            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}
                </div>
              ) : cleaners.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[var(--color-surface-elevated)] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">No cleaners yet</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">Add your first team member</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {cleaners.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => loadIntoForm(c)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedId === c.id
                          ? 'bg-[var(--color-accent-muted)] border-[var(--color-accent)]'
                          : 'bg-transparent border-transparent hover:bg-[var(--color-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          c.active !== false ? 'bg-cyan-500/20 text-cyan-300' : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {c.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium truncate">{c.full_name}</span>
                            {c.active === false && <Badge variant="default">Inactive</Badge>}
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] truncate">
                            {c.base_location_text || 'No location set'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Edit Form */}
          <div className="lg:col-span-2">
            <GlassCard className="p-5">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="text-heading text-white">
                  {selected ? 'Edit Cleaner' : 'New Cleaner'}
                </h2>
                <div className="flex items-center gap-2">
                  {selectedId && (
                    <Button onClick={deleteCleaner} variant="danger" size="sm">
                      Delete
                    </Button>
                  )}
                  <Button onClick={saveCleaner} loading={saving} variant="primary">
                    {selectedId ? 'Save Changes' : 'Add Cleaner'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Basic Info */}
                <Input
                  label="Full Name"
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="Enter full name"
                />
                <div className="flex items-end">
                  <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--glass-border)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                      className="w-5 h-5 rounded accent-cyan-500"
                    />
                    <span className="text-sm text-white">Active</span>
                  </label>
                </div>

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

                {/* Location */}
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
                      📍 Pinned: {form.base_lat.toFixed(5)}, {form.base_lng.toFixed(5)}
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
                <Input
                  label="Team Size"
                  type="number"
                  min={1}
                  value={form.team_size}
                  onChange={(e) => setForm((p) => ({ ...p, team_size: Number(e.target.value) }))}
                />

                {/* Bank Details */}
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

                {/* Rates */}
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

                {/* Availability Matrix */}
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
                            {form.availability?.[d]?.[b] ? '✓' : '—'}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transport */}
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
              </div>
            </GlassCard>
          </div>
        </div>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Cleaner Intake Link">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Share this one-time link with a cleaner so they can enter their own details.
          {inviteExpiry && (
            <span className="block mt-1 text-xs text-[var(--color-text-muted)]">
              Expires {new Date(inviteExpiry).toLocaleString()}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Input value={inviteLink || ''} readOnly />
          <Button variant="ghost" size="sm" onClick={copyInviteLink}>
            Copy
          </Button>
        </div>
      </Modal>
    </div>
  )
}

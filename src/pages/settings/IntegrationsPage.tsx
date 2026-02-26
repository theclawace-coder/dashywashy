/**
 * IntegrationsPage - Configure per-org API keys and integrations.
 * Cards for Stripe, Dialpad, Outlook, Resend, OpenAI, Mapbox.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input } from '../../components/ui'
import type { OrgIntegration } from '../../lib/types'

interface ProviderConfig {
  provider: string
  label: string
  icon: string
  fields: { key: string; label: string; placeholder: string; type?: string }[]
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  dialpad: ['api_key'],
  outlook: ['tenant_id', 'client_id', 'client_secret', 'user_email'],
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'stripe',
    label: 'Stripe',
    icon: '💳',
    fields: [
      { key: 'secret_key', label: 'SECRET KEY', placeholder: 'sk_live_...' },
      { key: 'webhook_secret', label: 'WEBHOOK SECRET', placeholder: 'whsec_...' },
      { key: 'success_url', label: 'SUCCESS URL', placeholder: 'https://yourdomain.com/payment-success' },
      { key: 'cancel_url', label: 'CANCEL URL', placeholder: 'https://yourdomain.com/payment-cancel' },
    ],
  },
  {
    provider: 'dialpad',
    label: 'Dialpad',
    icon: '📞',
    fields: [
      { key: 'api_key', label: 'API KEY', placeholder: 'dp_...' },
      { key: 'user_id', label: 'USER ID', placeholder: 'Dialpad user ID' },
    ],
  },
  {
    provider: 'outlook',
    label: 'Outlook (Microsoft)',
    icon: '📧',
    fields: [
      { key: 'tenant_id', label: 'TENANT ID', placeholder: 'Azure AD Tenant ID' },
      { key: 'client_id', label: 'CLIENT ID', placeholder: 'App Registration Client ID' },
      { key: 'client_secret', label: 'CLIENT SECRET', placeholder: 'Client secret value', type: 'password' },
      { key: 'user_email', label: 'USER EMAIL', placeholder: 'user@yourdomain.com' },
    ],
  },
  {
    provider: 'resend',
    label: 'Resend',
    icon: '✉️',
    fields: [
      { key: 'api_key', label: 'API KEY', placeholder: 're_...' },
      { key: 'from_email', label: 'FROM EMAIL', placeholder: 'noreply@yourdomain.com' },
      { key: 'reply_to_email', label: 'REPLY-TO EMAIL', placeholder: 'hello@yourdomain.com' },
    ],
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    icon: '🤖',
    fields: [
      { key: 'api_key', label: 'API KEY', placeholder: 'sk-...' },
      { key: 'model', label: 'MODEL', placeholder: 'gpt-4o-mini' },
    ],
  },
  {
    provider: 'mapbox',
    label: 'Mapbox',
    icon: '🗺️',
    fields: [{ key: 'token', label: 'PUBLIC TOKEN', placeholder: 'pk.ey...' }],
  },
]

export default function IntegrationsPage() {
  const { currentOrg, hasRole } = useAuth()
  const [, setIntegrations] = useState<Record<string, OrgIntegration>>({})
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({})
  const [enabledState, setEnabledState] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<string | null>(null)
  const [activationStatus, setActivationStatus] = useState<
    Record<string, { type: 'success' | 'error'; message: string }>
  >({})

  const fetchIntegrations = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)

    const { data } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('org_id', currentOrg.id)

    const map: Record<string, OrgIntegration> = {}
    const forms: Record<string, Record<string, string>> = {}
    const enabled: Record<string, boolean> = {}

    for (const row of data || []) {
      map[row.provider] = row
      forms[row.provider] = row.config || {}
      enabled[row.provider] = row.enabled
    }

    // Initialize empty forms for unconfigured providers
    for (const p of PROVIDERS) {
      if (!forms[p.provider]) {
        forms[p.provider] = {}
        enabled[p.provider] = false
      }
    }

    setIntegrations(map)
    setFormData(forms)
    setEnabledState(enabled)
    setLoading(false)
  }, [currentOrg])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const updateField = (provider: string, key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [key]: value },
    }))
  }

  const toggleEnabled = (provider: string) => {
    setEnabledState((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  const hasRequiredFields = (provider: string) => {
    const required = REQUIRED_FIELDS[provider] || []
    if (required.length === 0) return true
    const config = formData[provider] || {}
    return required.every((key) => (config[key] || '').trim())
  }

  const formatDate = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  const getStatusLine = (provider: string, config: Record<string, string>) => {
    if (provider === 'dialpad') {
      if (config?.dialpad_webhook_id) {
        const checked = formatDate(config?.dialpad_webhook_last_checked_at)
        return checked ? `Webhook active - Last checked ${checked}` : 'Webhook active'
      }
      if (config?.api_key) {
        return 'Webhook not activated yet'
      }
    }
    if (provider === 'outlook') {
      if (config?.outlook_subscription_expires_at) {
        return `Subscription active until ${formatDate(config?.outlook_subscription_expires_at)}`
      }
      if (config?.client_id || config?.tenant_id) {
        return 'Subscription not activated yet'
      }
    }
    return ''
  }

  const extractActivationErrorMessage = async (err: unknown): Promise<string> => {
    if (err && typeof err === 'object' && 'context' in err) {
      const context = (err as { context?: unknown }).context
      if (context instanceof Response) {
        try {
          const payload = await context.clone().json() as
            | { error?: string; details?: { error?: { message?: string } }; message?: string; status?: number }
            | undefined

          const base =
            payload?.error ||
            payload?.details?.error?.message ||
            payload?.message

          if (base) {
            return payload?.status ? `${base} (status ${payload.status})` : base
          }
        } catch {
          try {
            const text = await context.clone().text()
            if (text.trim()) return text
          } catch {
            // Fall through to default handling
          }
        }
      }
    }

    return err instanceof Error ? err.message : 'Activation failed'
  }

  const activateIntegration = async (provider: string) => {
    if (!currentOrg) return
    setActivating(provider)
    setActivationStatus((prev) => ({ ...prev, [provider]: { type: 'success', message: '' } }))

    try {
      const config = formData[provider] || {}
      const enabled = enabledState[provider] ?? false

      // Persist latest config/toggle first so edge functions read current state.
      const { error: saveError } = await supabase
        .from('organization_integrations')
        .upsert(
          {
            org_id: currentOrg.id,
            provider,
            config,
            enabled,
          },
          { onConflict: 'org_id,provider' }
        )

      if (saveError) {
        throw new Error(`Failed to save integration before activation: ${saveError.message}`)
      }

      let fnName = ''
      let body: Record<string, unknown> = {}

      if (provider === 'dialpad') {
        fnName = 'setup-dialpad-webhook'
        body = { action: 'ensure' }
      } else if (provider === 'outlook') {
        fnName = 'setup-outlook-webhook'
        body = { action: 'create' }
      } else {
        throw new Error('Unsupported integration')
      }

      const headers: Record<string, string> = {}
      if (currentOrg?.id) {
        headers['X-Org-Id'] = currentOrg.id
      }

      const { data, error } = await supabase.functions.invoke(fnName, { body, headers })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const message =
        provider === 'dialpad'
          ? data?.action === 'created'
            ? 'Webhook created'
            : 'Webhook already active'
          : data?.action === 'created'
            ? 'Subscription created'
            : data?.action === 'renewed'
              ? 'Subscription renewed'
              : 'Subscription checked'

      setActivationStatus((prev) => ({
        ...prev,
        [provider]: { type: 'success', message },
      }))
      await fetchIntegrations()
    } catch (err) {
      const message = await extractActivationErrorMessage(err)
      setActivationStatus((prev) => ({
        ...prev,
        [provider]: { type: 'error', message },
      }))
    } finally {
      setActivating(null)
    }
  }

  const handleSave = async (provider: string) => {
    if (!currentOrg) return
    setSaving(provider)
    setError(null)
    setSuccess(null)

    const config = formData[provider] || {}
    const enabled = enabledState[provider] ?? false

    // Debug: log what we're about to save
    console.log(`[IntegrationsPage] Saving ${provider}:`, {
      config: Object.keys(config).reduce((acc, key) => {
        acc[key] = key.includes('secret') || key.includes('key')
          ? config[key]?.substring(0, 8) + '...'
          : config[key]
        return acc
      }, {} as Record<string, string>),
      enabled,
      org_id: currentOrg.id,
    })

    const { error: err } = await supabase
      .from('organization_integrations')
      .upsert(
        {
          org_id: currentOrg.id,
          provider,
          config,
          enabled,
        },
        { onConflict: 'org_id,provider' }
      )

    if (err) {
      console.error(`[IntegrationsPage] Save error for ${provider}:`, err)
      setError(err.message)
    } else {
      console.log(`[IntegrationsPage] Save successful for ${provider}`)
      setSuccess(provider)
      setTimeout(() => setSuccess(null), 3000)
      fetchIntegrations()
    }
    setSaving(null)
  }

  if (!hasRole('admin')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">You need admin or owner access to manage integrations.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-title text-white">Integrations</h1>
        <p className="text-caption mt-1">Connect external services to your organization.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-caption">Loading integrations...</p>
      ) : (
        <div className="space-y-4">
          {PROVIDERS.map((p) => {
            const isExpanded = expanded === p.provider
            const isEnabled = enabledState[p.provider] ?? false
            const isSaving = saving === p.provider
            const isSuccess = success === p.provider
            const isActivating = activating === p.provider
            const hasConfig = Object.values(formData[p.provider] || {}).some((v) =>
              typeof v === 'string' ? v.trim() : v != null
            )
            const canActivate = isEnabled && hasConfig && hasRequiredFields(p.provider)
            const statusLine = getStatusLine(p.provider, formData[p.provider] || {})
            const activation = activationStatus[p.provider]

            return (
              <GlassCard key={p.provider} className="overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : p.provider)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{p.label}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {isEnabled && hasConfig ? 'Connected' : 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isEnabled && hasConfig && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                    <svg
                      className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded form */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-[var(--glass-border)] pt-4">
                    {/* Enable toggle */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleEnabled(p.provider)}
                        className="w-4 h-4 rounded accent-[var(--color-accent)]"
                      />
                      <span className="text-sm text-[var(--color-text-secondary)]">Enabled</span>
                    </label>

                    {/* Fields */}
                    {p.fields.map((field) => (
                      <Input
                        key={field.key}
                        label={field.label}
                        type={field.type || 'text'}
                        value={formData[p.provider]?.[field.key] || ''}
                        onChange={(e) => updateField(p.provider, field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    ))}

                    {statusLine && (
                      <p className="text-xs text-[var(--color-text-muted)]">{statusLine}</p>
                    )}

                    {activation?.message && (
                      <p className={`text-xs ${activation.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {activation.message}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      {isSuccess && <p className="text-xs text-emerald-400">Saved</p>}
                      {!isSuccess && <div />}
                      <div className="flex items-center gap-2">
                        {(p.provider === 'dialpad' || p.provider === 'outlook') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => activateIntegration(p.provider)}
                            loading={isActivating}
                            disabled={!canActivate}
                          >
                            Test & Activate
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSave(p.provider)}
                          loading={isSaving}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * DiagnosticsPage - Test integration configurations
 */

import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, supabaseUrl } from '../../lib/supabase'
import { GlassCard, Button } from '../../components/ui'

export default function DiagnosticsPage() {
  const { currentOrg } = useAuth()
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const testOutlookConfig = async () => {
    setTesting(true)
    setResults(null)

    try {
      // First, check if integration exists
      const { data: integration, error: integrationError } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('org_id', currentOrg?.id || '')
        .eq('provider', 'outlook')
        .maybeSingle()

      if (integrationError) {
        setResults({ error: 'Database error: ' + integrationError.message })
        return
      }

      if (!integration) {
        setResults({ error: 'No Outlook integration found. Please configure it in Settings → Integrations.' })
        return
      }

      const config = integration.config as Record<string, string>

      // Check required fields
      const missingFields = []
      if (!config.tenant_id) missingFields.push('tenant_id')
      if (!config.client_id) missingFields.push('client_id')
      if (!config.client_secret) missingFields.push('client_secret')
      if (!config.user_email) missingFields.push('user_email')

      if (missingFields.length > 0) {
        setResults({
          error: `Missing required fields: ${missingFields.join(', ')}`,
          config: {
            tenant_id: config.tenant_id ? '✓ Set' : '✗ Missing',
            client_id: config.client_id ? '✓ Set' : '✗ Missing',
            client_secret: config.client_secret ? '✓ Set' : '✗ Missing',
            user_email: config.user_email || '✗ Missing',
            enabled: integration.enabled ? '✓ Enabled' : '✗ Disabled',
          }
        })
        return
      }

      // Test authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setResults({ error: 'Not authenticated' })
        return
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      }
      if (currentOrg?.id) {
        headers['X-Org-Id'] = currentOrg.id
      }

      // Test the setup-outlook-webhook function
      const response = await fetch(`${supabaseUrl}/functions/v1/setup-outlook-webhook`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'list' }),
      })

      const data = await response.json()

      if (!response.ok) {
        setResults({
          error: 'Edge function error',
          status: response.status,
          statusText: response.statusText,
          details: data,
          config: {
            tenant_id: config.tenant_id ? config.tenant_id.substring(0, 8) + '... ✓' : '✗ Missing',
            client_id: config.client_id ? config.client_id.substring(0, 8) + '... ✓' : '✗ Missing',
            client_secret: config.client_secret ? config.client_secret.substring(0, 8) + '... ✓' : '✗ Missing',
            user_email: config.user_email ? config.user_email + ' ✓' : '✗ Missing',
            enabled: integration.enabled ? '✓ Enabled' : '✗ Disabled',
          }
        })
        return
      }

      // Success - show subscriptions
      setResults({
        success: true,
        subscriptions: data.value || [],
        config: {
          tenant_id: config.tenant_id ? config.tenant_id.substring(0, 8) + '... ✓' : '✗ Missing',
          client_id: config.client_id ? config.client_id.substring(0, 8) + '... ✓' : '✗ Missing',
          client_secret: config.client_secret ? config.client_secret.substring(0, 8) + '... ✓' : '✗ Missing',
          user_email: config.user_email ? config.user_email + ' ✓' : '✗ Missing',
          enabled: integration.enabled ? '✓ Enabled' : '✗ Disabled',
        }
      })

    } catch (err) {
      setResults({
        error: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      })
    } finally {
      setTesting(false)
    }
  }

  const testDialpadConfig = async () => {
    setTesting(true)
    setResults(null)

    try {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('org_id', currentOrg?.id || '')
        .eq('provider', 'dialpad')
        .maybeSingle()

      if (!integration) {
        setResults({ error: 'No Dialpad integration found' })
        return
      }

      const config = integration.config as Record<string, string>

      setResults({
        config: {
          api_key: config.api_key ? config.api_key.substring(0, 10) + '... ✓' : '✗ Missing',
          user_id: config.user_id || '✗ Missing',
          enabled: integration.enabled ? '✓ Enabled' : '✗ Disabled',
        }
      })
    } catch (err) {
      setResults({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-title text-white">Integration Diagnostics</h1>
        <p className="text-caption mt-1">Test your integration configurations</p>
      </div>

      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Outlook Email</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          This will check your Outlook configuration and test authentication with Microsoft Graph.
        </p>
        <Button onClick={testOutlookConfig} loading={testing} variant="primary">
          Test Outlook Configuration
        </Button>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Dialpad</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          This will check your Dialpad API configuration.
        </p>
        <Button onClick={testDialpadConfig} loading={testing} variant="primary">
          Test Dialpad Configuration
        </Button>
      </GlassCard>

      {results && (
        <GlassCard className={`p-6 ${results.error ? 'border-red-500/50' : 'border-emerald-500/50'}`}>
          <h3 className="text-heading text-white mb-4">
            {results.error ? '❌ Error' : '✅ Success'}
          </h3>

          {results.config && (
            <div className="mb-4">
              <p className="text-sm font-medium text-white mb-2">Configuration:</p>
              <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto">
                {JSON.stringify(results.config, null, 2)}
              </pre>
            </div>
          )}

          {results.error && (
            <div className="mb-4">
              <p className="text-sm font-medium text-red-400 mb-2">Error:</p>
              <p className="text-sm text-red-300">{results.error}</p>
            </div>
          )}

          {results.details && (
            <div className="mb-4">
              <p className="text-sm font-medium text-white mb-2">Details:</p>
              <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto max-h-96">
                {JSON.stringify(results.details, null, 2)}
              </pre>
            </div>
          )}

          {results.subscriptions && (
            <div>
              <p className="text-sm font-medium text-white mb-2">
                Active Subscriptions ({results.subscriptions.length}):
              </p>
              {results.subscriptions.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No active subscriptions found</p>
              ) : (
                <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto max-h-96">
                  {JSON.stringify(results.subscriptions, null, 2)}
                </pre>
              )}
            </div>
          )}

          {results.stack && (
            <details className="mt-4">
              <summary className="text-sm text-[var(--color-text-muted)] cursor-pointer">Stack trace</summary>
              <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto mt-2">
                {results.stack}
              </pre>
            </details>
          )}
        </GlassCard>
      )}
    </div>
  )
}

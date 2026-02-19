/**
 * CommunicationsDebugPage - Debug communications data
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button } from '../../components/ui'

export default function CommunicationsDebugPage() {
  const { currentOrg } = useAuth()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const runDiagnostics = async () => {
    setLoading(true)
    setResults(null)

    try {
      if (!currentOrg) {
        setResults({ error: 'No organization selected' })
        return
      }

      // Check data in the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [callsRes, smsRes, emailsRes] = await Promise.all([
        supabase
          .from('dialpad_calls')
          .select('*')
          .eq('org_id', currentOrg.id)
          .gte('created_at', yesterday)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('dialpad_sms')
          .select('*')
          .eq('org_id', currentOrg.id)
          .gte('created_at', yesterday)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('dialpad_emails')
          .select('*')
          .eq('org_id', currentOrg.id)
          .gte('created_at', yesterday)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      const [totalCallsRes, totalSmsRes, totalEmailsRes] = await Promise.all([
        supabase
          .from('dialpad_calls')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id),
        supabase
          .from('dialpad_sms')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id),
        supabase
          .from('dialpad_emails')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', currentOrg.id),
      ])

      setResults({
        success: true,
        currentOrg: {
          id: currentOrg.id,
          name: currentOrg.name || currentOrg.business_name,
        },
        last24Hours: {
          calls: {
            count: callsRes.data?.length || 0,
            sample: callsRes.data?.slice(0, 3) || [],
            error: callsRes.error?.message,
          },
          sms: {
            count: smsRes.data?.length || 0,
            sample: smsRes.data?.slice(0, 3) || [],
            error: smsRes.error?.message,
          },
          emails: {
            count: emailsRes.data?.length || 0,
            sample: emailsRes.data?.slice(0, 3) || [],
            error: emailsRes.error?.message,
          },
        },
        totalCounts: {
          calls: totalCallsRes.count || 0,
          sms: totalSmsRes.count || 0,
          emails: totalEmailsRes.count || 0,
        },
      })
    } catch (err) {
      setResults({
        error: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentOrg) {
      runDiagnostics()
    }
  }, [currentOrg])

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-title text-white">Communications Diagnostics</h1>
        <p className="text-caption mt-1">Debug why communications aren't showing</p>
      </div>

      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-heading text-white">Data Check</h2>
          <Button onClick={runDiagnostics} loading={loading} variant="primary">
            Refresh
          </Button>
        </div>

        {results && (
          <div className="space-y-6">
            {results.error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-sm text-red-400">❌ {results.error}</p>
              </div>
            )}

            {results.success && (
              <>
                {/* Current Org */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <h3 className="text-sm font-medium text-white mb-2">Current Organization</h3>
                  <pre className="text-xs text-gray-300">
                    {JSON.stringify(results.currentOrg, null, 2)}
                  </pre>
                </div>

                {/* Total Counts */}
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h3 className="text-sm font-medium text-white mb-2">Total Data (All Time)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-400">Calls</p>
                      <p className="text-2xl font-bold text-cyan-400">{results.totalCounts.calls}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">SMS</p>
                      <p className="text-2xl font-bold text-violet-400">{results.totalCounts.sms}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Emails</p>
                      <p className="text-2xl font-bold text-blue-400">{results.totalCounts.emails}</p>
                    </div>
                  </div>
                </div>

                {/* Last 24 Hours */}
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <h3 className="text-sm font-medium text-white mb-3">Last 24 Hours</h3>

                  {/* Calls */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-cyan-400 mb-2">
                      Calls: {results.last24Hours.calls.count}
                    </p>
                    {results.last24Hours.calls.error && (
                      <p className="text-xs text-red-400 mb-2">Error: {results.last24Hours.calls.error}</p>
                    )}
                    {results.last24Hours.calls.sample.length > 0 && (
                      <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(results.last24Hours.calls.sample, null, 2)}
                      </pre>
                    )}
                  </div>

                  {/* SMS */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-violet-400 mb-2">
                      SMS: {results.last24Hours.sms.count}
                    </p>
                    {results.last24Hours.sms.error && (
                      <p className="text-xs text-red-400 mb-2">Error: {results.last24Hours.sms.error}</p>
                    )}
                    {results.last24Hours.sms.sample.length > 0 && (
                      <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(results.last24Hours.sms.sample, null, 2)}
                      </pre>
                    )}
                  </div>

                  {/* Emails */}
                  <div>
                    <p className="text-sm font-medium text-blue-400 mb-2">
                      Emails: {results.last24Hours.emails.count}
                    </p>
                    {results.last24Hours.emails.error && (
                      <p className="text-xs text-red-400 mb-2">Error: {results.last24Hours.emails.error}</p>
                    )}
                    {results.last24Hours.emails.sample.length > 0 && (
                      <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(results.last24Hours.emails.sample, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>

                {/* Diagnosis */}
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <h3 className="text-sm font-medium text-white mb-2">Diagnosis</h3>
                  <div className="space-y-2 text-sm">
                    {results.totalCounts.calls === 0 && results.totalCounts.sms === 0 && results.totalCounts.emails === 0 ? (
                      <p className="text-yellow-400">⚠️ No data found. Click "Sync All" on the Dashboard to pull data.</p>
                    ) : (
                      <>
                        <p className="text-emerald-400">✓ Data exists in database ({results.totalCounts.calls + results.totalCounts.sms + results.totalCounts.emails} total records)</p>
                        {results.last24Hours.calls.count > 0 || results.last24Hours.sms.count > 0 || results.last24Hours.emails.count > 0 ? (
                          <p className="text-emerald-400">✓ Recent data found ({results.last24Hours.calls.count + results.last24Hours.sms.count + results.last24Hours.emails.count} in last 24h)</p>
                        ) : (
                          <p className="text-yellow-400">⚠️ No data in last 24 hours. Webhooks may not be delivering.</p>
                        )}
                        {results.last24Hours.calls.error || results.last24Hours.sms.error || results.last24Hours.emails.error ? (
                          <p className="text-red-400">❌ Query errors detected. Check RLS policies or permissions.</p>
                        ) : (
                          <p className="text-emerald-400">✓ Queries executing successfully</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

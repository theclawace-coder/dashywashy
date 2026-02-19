import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { GlassCard, Badge, Button } from './ui'

const PAGE_SIZE = 100

type LeadRecord = {
  id: string
  name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
  created_at: string | null
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function ContactsPage() {
  const { currentOrg } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [hasMore, setHasMore] = useState(false)

  const fetchLeadsPage = async (offset = 0, append = false) => {
    if (!currentOrg) return
    try {
      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }

      const { data, error } = await supabase
        .from('extracted_leads')
        .select('id, name, email, phone_number, status, created_at')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      const nextBatch = (data || []) as LeadRecord[]

      setLeads((prev) => (append ? [...prev, ...nextBatch] : nextBatch))
      setHasMore(nextBatch.length === PAGE_SIZE)
    } catch (err) {
      console.error('Failed to load contacts', err)
      if (!append) {
        setLeads([])
      }
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }

  const fetchLeads = async () => {
    setHasMore(false)
    await fetchLeadsPage(0, false)
  }

  const loadMoreLeads = async () => {
    if (isLoading || isLoadingMore || !hasMore) return
    await fetchLeadsPage(leads.length, true)
  }

  useEffect(() => {
    fetchLeads()
  }, [currentOrg?.id])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return leads
    return leads.filter((lead) =>
      [lead.name, lead.email, lead.phone_number, lead.status].filter(Boolean).join(' ').toLowerCase().includes(term)
    )
  }, [leads, search])

  if (!currentOrg) return null

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-white">Contacts</h1>
            <p className="text-caption mt-1">All leads and customers</p>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchLeads} loading={isLoading}>
            Refresh
          </Button>
        </header>

        <GlassCard className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search contacts..."
              className="input w-full md:max-w-md"
            />
            <div className="text-xs text-[var(--color-text-muted)]">
              Showing {filtered.length} of {leads.length} loaded
            </div>
          </div>
        </GlassCard>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-16 rounded-xl shimmer" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">No contacts found.</p>
            {hasMore && (
              <div className="mt-4">
                <Button variant="secondary" size="sm" onClick={loadMoreLeads} loading={isLoadingMore}>
                  Load more contacts
                </Button>
              </div>
            )}
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filtered.map((lead) => (
              <Link
                key={lead.id}
                to={`/app/leads/${lead.id}?return=/app/contacts`}
                className="block"
                aria-label={`Open ${lead.name || lead.email || lead.phone_number || 'lead'}`}
              >
                <GlassCard className="p-4 hover:border-cyan-400/40 transition">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium">
                          {lead.name || lead.email || lead.phone_number || 'Unknown'}
                        </p>
                        {lead.status && <Badge variant="default">{lead.status}</Badge>}
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {lead.email || '-'} {lead.phone_number ? ` | ${lead.phone_number}` : ''}
                      </p>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      Added {formatDate(lead.created_at)}
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" onClick={loadMoreLeads} loading={isLoadingMore}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

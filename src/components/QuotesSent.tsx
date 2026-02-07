/**
 * QuotesSent - Apple VisionOS Quote Analytics
 * 
 * A beautiful interface for tracking all sent quotes.
 * Glass cards, status badges, and financial insights.
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { downloadReceiptPdf } from '../lib/receiptPdf'
import { GlassCard, Button, Badge, useToast, StatCard } from './ui'

type QuoteRecord = {
  id: string
  lead_id: string | null
  email_id: string | null
  quote_number?: string | null
  address?: string | null
  description?: string | null
  service: string
  bedrooms: number
  bathrooms: number
  addons: string[]
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
  accepted_at?: string | null
  accepted_payment_method?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  share_token?: string | null
  created_at?: string
  lead?: { name?: string | null; phone_number?: string | null; email?: string | null; status?: string | null }
}

const STATUS_FILTERS = ['All', 'Pending', 'Paid', 'Won'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const TIME_FILTERS = ['All Time', 'This Week', 'Last Week', 'Last 7 Days', 'Last 30 Days', 'Custom'] as const
type TimeFilter = (typeof TIME_FILTERS)[number]

export default function QuotesSent() {
  const { addToast } = useToast()
  const { currentOrg } = useAuth()
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [receiptGeneratingId, setReceiptGeneratingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('All Time')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchQuotes = async () => {
    try {
      setIsLoading(true)
      if (!currentOrg) {
        setQuotes([])
        setIsLoading(false)
        return
      }
      const { data, error: quotesError } = await supabase
        .from('quotes')
        .select(`*, lead:extracted_leads (name, phone_number, email, status)`)
        .eq('org_id', currentOrg.id)
        .is('base_quote_id', null)
        .order('created_at', { ascending: false })

      if (quotesError) throw quotesError
      setQuotes((data || []) as QuoteRecord[])
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load quotes', message: err?.message })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!currentOrg) return
    fetchQuotes()
    const channel = supabase
      .channel('quotes_sent_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes', filter: 'org_id=eq.' + currentOrg.id },
        () => fetchQuotes()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentOrg])

  const filteredQuotes = useMemo(() => {
    let result = quotes

    // Time filter
    if (timeFilter !== 'All Time') {
      const startOfWeek = (input: Date) => {
        const d = new Date(input)
        const day = (d.getDay() + 6) % 7
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - day)
        return d
      }

      let rangeStart: Date | null = null
      let rangeEnd: Date | null = null
      const now = new Date()

      if (timeFilter === 'This Week') {
        rangeStart = startOfWeek(now)
        rangeEnd = now
      } else if (timeFilter === 'Last Week') {
        const thisWeekStart = startOfWeek(now)
        rangeStart = new Date(thisWeekStart)
        rangeStart.setDate(rangeStart.getDate() - 7)
        rangeEnd = thisWeekStart
      } else if (timeFilter === 'Last 7 Days') {
        rangeStart = new Date(now)
        rangeStart.setDate(rangeStart.getDate() - 7)
        rangeStart.setHours(0, 0, 0, 0)
        rangeEnd = now
      } else if (timeFilter === 'Last 30 Days') {
        rangeStart = new Date(now)
        rangeStart.setDate(rangeStart.getDate() - 30)
        rangeStart.setHours(0, 0, 0, 0)
        rangeEnd = now
      } else if (timeFilter === 'Custom') {
        if (customStart) { rangeStart = new Date(customStart); rangeStart.setHours(0, 0, 0, 0) }
        if (customEnd) { rangeEnd = new Date(customEnd); rangeEnd.setHours(23, 59, 59, 999) }
      }

      result = result.filter((q) => {
        const createdAt = q.created_at ? new Date(q.created_at) : null
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false
        if (rangeStart && createdAt < rangeStart) return false
        if (rangeEnd && createdAt > rangeEnd) return false
        return true
      })
    }

    // Status filter
    if (statusFilter !== 'All') {
      result = result.filter((q) => {
        if (statusFilter === 'Paid') return q.accepted_payment_method === 'card_paid'
        if (statusFilter === 'Pending') return !q.accepted_payment_method || q.accepted_payment_method !== 'card_paid'
        if (statusFilter === 'Won') return q.lead?.status === 'Job Won'
        return true
      })
    }

    // Search
    if (search.trim()) {
      const term = search.toLowerCase()
      result = result.filter((q) => {
        const haystack = [q.customer_name, q.customer_email, q.customer_phone, q.quote_number, q.address, q.service, q.lead?.name, q.lead?.email].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(term)
      })
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0
      if (sortBy === 'date') {
        comparison = new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
      } else if (sortBy === 'amount') {
        comparison = (a.total_inc_gst || 0) - (b.total_inc_gst || 0)
      } else if (sortBy === 'customer') {
        comparison = (a.customer_name || a.lead?.name || '').toLowerCase().localeCompare((b.customer_name || b.lead?.name || '').toLowerCase())
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [quotes, search, statusFilter, timeFilter, customStart, customEnd, sortBy, sortOrder])

  const totals = useMemo(() => {
    const totalValue = filteredQuotes.reduce((sum, q) => sum + (q.total_inc_gst || 0), 0)
    const paidValue = filteredQuotes.filter((q) => q.accepted_payment_method === 'card_paid').reduce((sum, q) => sum + (q.total_inc_gst || 0), 0)
    const wonValue = filteredQuotes.filter((q) => q.lead?.status === 'Job Won' && q.accepted_payment_method !== 'card_paid').reduce((sum, q) => sum + (q.total_inc_gst || 0), 0)
    const totalSalesValue = paidValue + wonValue
    const projectedProfit = filteredQuotes.reduce((sum, q) => sum + (q.profit || 0), 0)
    return { totalValue, paidValue, totalSalesValue, projectedProfit, count: filteredQuotes.length }
  }, [filteredQuotes])

  const getQuoteStatus = (quote: QuoteRecord) => {
    if (quote.accepted_payment_method === 'card_paid') return { label: 'Paid', variant: 'success' as const, icon: '✅' }
    if (quote.lead?.status === 'Job Won') return { label: 'Won', variant: 'info' as const, icon: '🎉' }
    return { label: 'Pending', variant: 'warning' as const, icon: '⏳' }
  }

  const businessName = import.meta.env.VITE_BUSINESS_NAME || 'Sydney Premium Cleaning'
  const businessOperatingName = import.meta.env.VITE_BUSINESS_OPERATING_NAME || 'SYDNEY PREMIUM CLEANING AU'
  const businessLegalName = import.meta.env.VITE_BUSINESS_LEGAL_NAME || ''
  const businessAbn = import.meta.env.VITE_BUSINESS_ABN || '95 675 300 875'
  const businessEmail = import.meta.env.VITE_BUSINESS_EMAIL || 'sales@sydneypremiumcleaning.com.au'
  const businessPhone = import.meta.env.VITE_BUSINESS_PHONE || '0426413984'
  const businessAddress = import.meta.env.VITE_BUSINESS_ADDRESS || ''

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              Quotes Sent
            </h1>
            <p className="text-caption mt-1">All saved and sent quotes in one place</p>
          </div>
          <Button onClick={fetchQuotes} loading={isLoading} variant="primary" size="sm">
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Quotes" value={totals.count} accentColor="#64748b" />
          <StatCard label="Total Value" value={`$${totals.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} accentColor="#38bdf8" />
          <StatCard label="Total Sales" value={`$${totals.totalSalesValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} accentColor="#34d399" />
          <StatCard label="Projected Profit" value={`$${totals.projectedProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} accentColor="#a78bfa" />
        </div>

        {/* Filters */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotes..." className="input pl-10 w-full" />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              {STATUS_FILTERS.map((status) => (
                <Button key={status} variant={statusFilter === status ? 'primary' : 'ghost'} size="sm" onClick={() => setStatusFilter(status)}>
                  {status}
                </Button>
              ))}
            </div>

            {/* Time Filter */}
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as TimeFilter)} className="input px-3 py-2">
              {TIME_FILTERS.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
            {timeFilter === 'Custom' && (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="input px-3 py-2" />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="input px-3 py-2" />
              </>
            )}

            {/* Sort */}
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-') as ['date' | 'amount' | 'customer', 'asc' | 'desc']
                setSortBy(by)
                setSortOrder(order)
              }}
              className="input px-3 py-2"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="amount-desc">Highest Amount</option>
              <option value="amount-asc">Lowest Amount</option>
              <option value="customer-asc">Customer A-Z</option>
              <option value="customer-desc">Customer Z-A</option>
            </select>
          </div>
        </GlassCard>

        {/* Quotes List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl shimmer" />)}
          </div>
        ) : filteredQuotes.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-surface-elevated)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">No quotes found</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">Try adjusting your filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filteredQuotes.map((quote) => {
              const status = getQuoteStatus(quote)
              const customerName = quote.customer_name || quote.lead?.name || 'Unknown'
              const customerContact = quote.customer_email || quote.lead?.email || quote.customer_phone || quote.lead?.phone_number || ''
              const isExpanded = expandedId === quote.id

              return (
                <GlassCard 
                  key={quote.id} 
                  className="overflow-hidden transition-all cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : quote.id)}
                >
                  <div className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {/* Status Icon */}
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-[var(--color-surface-elevated)]">
                          {status.icon}
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-white">{customerName}</h3>
                            <Badge variant={status.variant}>{status.label}</Badge>
                            {quote.quote_number && (
                              <span className="text-xs text-[var(--color-text-muted)] font-mono">#{quote.quote_number}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-[var(--color-text-secondary)] flex-wrap">
                            {customerContact && <span>{customerContact}</span>}
                            <span className="capitalize">{quote.service} clean</span>
                            <span>{quote.bedrooms} bed / {quote.bathrooms} bath</span>
                          </div>
                          {quote.address && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate max-w-md">📍 {quote.address}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-white font-mono">
                            ${quote.total_inc_gst?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {quote.created_at ? new Date(quote.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </p>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {quote.share_token && (
                            <a href={`${window.location.origin}?quote=${quote.share_token}`} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="sm" title="View quote">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </Button>
                            </a>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={receiptGeneratingId === quote.id}
                            title="Download receipt"
                            onClick={async () => {
                              setReceiptGeneratingId(quote.id)
                              try {
                                const paymentMethod = window.prompt('Payment method for this receipt?', 'Manual')?.trim() || 'Manual'
                                const receiptNumber = `${quote.quote_number || quote.id}-R-MANUAL`
                                await downloadReceiptPdf({
                                  businessName, businessOperatingName, businessLegalName: businessLegalName || undefined, businessAbn: businessAbn || undefined, businessEmail: businessEmail || undefined, businessPhone: businessPhone || undefined, businessAddress: businessAddress || undefined,
                                  receiptNumber, issueDate: new Date().toLocaleString('en-AU'), paymentMethod,
                                  customerName: quote.customer_name || quote.lead?.name || 'Client', customerEmail: (quote.customer_email || quote.lead?.email) || undefined,
                                  serviceLabel: quote.service || 'Cleaning service', serviceAddress: quote.address || undefined, addonsLabel: Array.isArray(quote.addons) && quote.addons.length ? quote.addons.join(', ') : undefined,
                                  subtotal: Number(quote.subtotal || 0), discount: Number(quote.discount_amount || 0), gst: Number(quote.gst || 0), total: Number(quote.total_inc_gst || 0),
                                  paidAmount: quote.accepted_payment_method === 'card_paid' ? Number(quote.total_inc_gst || 0) : undefined,
                                })
                                addToast({ type: 'success', title: '📄 Receipt downloaded!' })
                              } catch (err: any) {
                                addToast({ type: 'error', title: 'Receipt failed', message: err?.message })
                              } finally {
                                setReceiptGeneratingId(null)
                              }
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Copy link"
                            onClick={async () => {
                              if (!quote.share_token) return
                              const url = `${window.location.origin}?quote=${quote.share_token}`
                              try {
                                await navigator.clipboard.writeText(url)
                                addToast({ type: 'success', title: 'Link copied!' })
                              } catch {
                                addToast({ type: 'error', title: 'Copy failed' })
                              }
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[var(--glass-border)] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div>
                            <p className="text-micro mb-1">Subtotal</p>
                            <p className="text-white font-medium">${quote.subtotal?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-micro mb-1">Discount</p>
                            <p className="text-white font-medium">${quote.discount_amount?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-micro mb-1">GST</p>
                            <p className="text-white font-medium">${quote.gst?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-micro mb-1">Deposit</p>
                            <p className="text-white font-medium">${quote.deposit_amount?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-micro mb-1">Profit</p>
                            <p className="text-emerald-400 font-medium">${quote.profit?.toFixed(2)} ({quote.margin?.toFixed(1)}%)</p>
                          </div>
                        </div>
                        {quote.notes && (
                          <p className="mt-3 text-sm text-[var(--color-text-muted)] italic">Notes: {quote.notes}</p>
                        )}
                        {quote.addons && quote.addons.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {quote.addons.map((addon, i) => (
                              <Badge key={i} variant="default">{addon}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </GlassCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

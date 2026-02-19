import { useState } from 'react'

const PLACEHOLDER_GROUPS: Array<{ title: string; items: Array<{ key: string; label: string }> }> = [
  {
    title: 'Lead',
    items: [
      { key: '{{name}}', label: 'Name' },
      { key: '{{first_name}}', label: 'First name' },
      { key: '{{email}}', label: 'Email' },
      { key: '{{phone}}', label: 'Phone' },
      { key: '{{lead_name}}', label: 'Lead name' },
      { key: '{{lead_email}}', label: 'Lead email' },
      { key: '{{lead_phone}}', label: 'Lead phone' },
      { key: '{{lead_number}}', label: 'Lead number' },
    ],
  },
  {
    title: 'Booking',
    items: [
      { key: '{{booking_date}}', label: 'Booking date' },
      { key: '{{booking_time}}', label: 'Booking time' },
      { key: '{{booking_datetime}}', label: 'Booking datetime' },
      { key: '{{booking_end}}', label: 'Booking end' },
      { key: '{{booking_status}}', label: 'Booking status' },
      { key: '{{booking_notes}}', label: 'Booking notes' },
      { key: '{{booking_address}}', label: 'Booking address' },
      { key: '{{booking_title}}', label: 'Booking title' },
      { key: '{{service_title}}', label: 'Service title' },
    ],
  },
  {
    title: 'Quote',
    items: [
      { key: '{{quote_number}}', label: 'Quote number' },
      { key: '{{quote_total}}', label: 'Quote total' },
      { key: '{{quote_subtotal}}', label: 'Quote subtotal' },
      { key: '{{quote_discount}}', label: 'Quote discount' },
      { key: '{{quote_gst}}', label: 'Quote GST' },
      { key: '{{quote_deposit}}', label: 'Quote deposit' },
      { key: '{{quote_remaining}}', label: 'Quote remaining' },
      { key: '{{quote_service}}', label: 'Quote service' },
      { key: '{{quote_address}}', label: 'Quote address' },
      { key: '{{quote_addons}}', label: 'Quote add-ons' },
      { key: '{{quote_share_link}}', label: 'Quote link' },
    ],
  },
  {
    title: 'Payment',
    items: [
      { key: '{{payment_status}}', label: 'Payment status' },
      { key: '{{payment_paid_at}}', label: 'Payment date' },
      { key: '{{payment_amount}}', label: 'Payment amount' },
      { key: '{{payment_link}}', label: 'Payment link' },
      { key: '{{receipt_number}}', label: 'Receipt number' },
      { key: '{{payment_method}}', label: 'Payment method' },
      { key: '{{amount}}', label: 'Amount (alias)' },
    ],
  },
  {
    title: 'Cleaner',
    items: [
      { key: '{{cleaner_name}}', label: 'Cleaner name' },
      { key: '{{cleaner_phone}}', label: 'Cleaner phone' },
      { key: '{{cleaner_email}}', label: 'Cleaner email' },
    ],
  },
  {
    title: 'Org',
    items: [
      { key: '{{business_name}}', label: 'Business name' },
      { key: '{{org_name}}', label: 'Org name' },
      { key: '{{org_business_name}}', label: 'Org business name' },
      { key: '{{org_email}}', label: 'Org email' },
      { key: '{{org_phone}}', label: 'Org phone' },
      { key: '{{org_abn}}', label: 'Org ABN' },
      { key: '{{org_operating_name}}', label: 'Org operating name' },
    ],
  },
  {
    title: 'Links',
    items: [{ key: '{{review_link}}', label: 'Review link' }],
  },
  {
    title: 'Summary',
    items: [
      { key: '{{summary_date}}', label: 'Summary date' },
      { key: '{{summary_sales_count}}', label: 'Sales count' },
      { key: '{{summary_sales_total}}', label: 'Sales total' },
      { key: '{{summary_projected_profit}}', label: 'Projected profit' },
      { key: '{{summary_repeat_clients}}', label: 'Repeat clients' },
      { key: '{{summary_outbound_calls}}', label: 'Outbound calls' },
      { key: '{{summary_inbound_calls}}', label: 'Inbound calls' },
      { key: '{{summary_leads_count}}', label: 'Leads count' },
      { key: '{{summary_quotes_count}}', label: 'Quotes count' },
      { key: '{{summary_cleans_count}}', label: 'Cleans today' },
      { key: '{{summary_sales_lines}}', label: 'Sales lines' },
      { key: '{{summary_clean_lines}}', label: 'Clean lines' },
    ],
  },
]

type PlaceholderPaletteProps = {
  onInsert?: (placeholder: string) => void
}

export default function PlaceholderPalette({ onInsert }: PlaceholderPaletteProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const handleInsert = async (placeholder: string) => {
    onInsert?.(placeholder)
    try {
      await navigator.clipboard.writeText(placeholder)
      setCopied(placeholder)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="space-y-4">
      {PLACEHOLDER_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] mb-2">{group.title}</p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleInsert(item.key)}
                className="px-2 py-1 rounded-full bg-white/10 text-xs text-white/80 hover:bg-white/20"
                title={item.key}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {copied && (
        <p className="text-[11px] text-emerald-400">Copied {copied} to clipboard</p>
      )}
    </div>
  )
}


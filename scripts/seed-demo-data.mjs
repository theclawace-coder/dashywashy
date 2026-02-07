import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const fileEnv = loadEnvFile()
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL).')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ORG_ID = process.env.SEED_ORG_ID || '00000000-0000-0000-0000-000000000001'

const now = new Date()
const ms = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
}
const isoMinus = (milliseconds) => new Date(now.getTime() - milliseconds).toISOString()
const isoPlus = (milliseconds) => new Date(now.getTime() + milliseconds).toISOString()
const dateMinusDays = (days) => new Date(now.getTime() - days * ms.day).toISOString().slice(0, 10)
const datePlusDays = (days) => new Date(now.getTime() + days * ms.day).toISOString().slice(0, 10)

function uuidFromSeed(seed) {
  const hex = createHash('md5').update(seed).digest('hex').split('')
  hex[12] = '4'
  hex[16] = '8'
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex
    .slice(12, 16)
    .join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function pick(list, idx) {
  return list[idx % list.length]
}

function round2(value) {
  return Math.round(value * 100) / 100
}

async function upsertRows(table, rows, onConflict = 'id') {
  if (!rows.length) return
  let attemptRows = rows
  const removed = new Set()

  while (true) {
    const { error } = await supabase.from(table).upsert(attemptRows, {
      onConflict,
      ignoreDuplicates: true,
    })

    if (!error) return

    const missingMatch = error.message.match(/Could not find the '(.+?)' column/)
    if (missingMatch) {
      const missingCol = missingMatch[1]
      if (removed.has(missingCol)) {
        throw new Error(`Failed to upsert into ${table}: ${error.message}`)
      }
      removed.add(missingCol)
      attemptRows = attemptRows.map((row) => {
        const { [missingCol]: _omit, ...rest } = row
        return rest
      })
      continue
    }

    throw new Error(`Failed to upsert into ${table}: ${error.message}`)
  }
}

async function fetchTemplateId(table, step = 1, variant = 1) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('step', step)
    .eq('variant', variant)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn(`Skipping ${table} logs (missing table or data): ${error.message}`)
    return null
  }
  return data?.id || null
}

async function ensureDefaultOrg() {
  await upsertRows(
    'organizations',
    [
      {
        id: ORG_ID,
        name: 'Sydney Premium Cleaning',
        slug: 'sydney-premium-cleaning',
        business_name: 'Sydney Premium Cleaning Pty Ltd',
        business_abn: null,
        business_phone: '0426 413 984',
        business_email: 'sales@sydneypremiumcleaning.com.au',
        business_operating_name: 'Sydney Premium Cleaning',
        timezone: 'Australia/Sydney',
        currency: 'AUD',
        default_client_hourly_rate: 60.0,
        default_cleaner_hourly_rate: 35.0,
        gst_rate: 0.1,
        default_discount_pct: 10.0,
        default_deposit_pct: 0.0,
        plan: 'pro',
        max_users: 25,
        max_cleaners: 50,
      },
    ],
    'id'
  )
}

async function run() {
  await ensureDefaultOrg()

  const names = [
    'Amelia Hart',
    'Noah King',
    'Olivia Stone',
    'Ethan Brooks',
    'Charlotte Reed',
    'Liam Ward',
    'Ava Collins',
    'Mason Price',
    'Sophia Grant',
    'Lucas Bell',
    'Mia Knight',
    'James Foster',
    'Ella Hayes',
    'Benjamin Scott',
    'Grace Parker',
    'Henry Morgan',
    'Chloe Bennett',
    'Jack Hughes',
    'Zoe Richardson',
    'Oscar Lewis',
    'Lily Cooper',
    'Leo Murphy',
    'Ruby Powell',
    'Archer Thompson',
    'Isla Turner',
    'Hudson Campbell',
    'Hannah Carter',
    'Finn Patel',
    'Sienna Ross',
    'Elliot Adams',
  ]

  const suburbs = [
    { name: 'Bondi NSW', lat: -33.8915, lng: 151.2767 },
    { name: 'Parramatta NSW', lat: -33.815, lng: 151.002 },
    { name: 'Chatswood NSW', lat: -33.7969, lng: 151.181 },
    { name: 'Surry Hills NSW', lat: -33.8893, lng: 151.212 },
    { name: 'Newtown NSW', lat: -33.897, lng: 151.178 },
    { name: 'Manly NSW', lat: -33.795, lng: 151.286 },
    { name: 'Cronulla NSW', lat: -34.058, lng: 151.152 },
    { name: 'Ryde NSW', lat: -33.813, lng: 151.107 },
  ]

  const statuses = ['New', 'Quote Sent', 'Marketing Loop', 'Job Won', 'Jobs Completed']
  const services = ['standard', 'deep', 'end_of_lease']

  const cleaners = Array.from({ length: 6 }).map((_, idx) => {
    const name = ['Morgan Patel', 'Taylor Chen', 'Riley Jones', 'Casey Nguyen', 'Jordan Kim', 'Alex Rivera'][idx]
    return {
      id: uuidFromSeed(`cleaner-${idx + 1}`),
      full_name: name,
      phone: `+61410${(100000 + idx * 721).toString().slice(-6)}`,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      base_location_text: pick(suburbs, idx).name,
      base_lat: pick(suburbs, idx).lat,
      base_lng: pick(suburbs, idx).lng,
      bank_account_name: name,
      bank_bsb: '062000',
      bank_account_number: `87${(654321 + idx * 321).toString().slice(-6)}`,
      rates: { standard: 45 + idx, deep: 55 + idx, end_of_lease: 65 + idx },
      availability: {
        Mon: { Morning: true, Afternoon: idx % 2 === 0 },
        Wed: { Morning: true },
        Fri: { Afternoon: true },
      },
      has_transport: true,
      transport_type: 'car',
      org_id: ORG_ID,
    }
  })

  await upsertRows('cleaners', cleaners)

  const leads = names.map((fullName, idx) => {
    const [first, last] = fullName.split(' ')
    const status = pick(statuses, idx)
    const suburb = pick(suburbs, idx)
    return {
      id: uuidFromSeed(`lead-${idx + 1}`),
      email_id: uuidFromSeed(`email-${idx + 1}`),
      name: fullName,
      phone_number: `+61400${(100000 + idx * 911).toString().slice(-6)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      region_notes: `${suburb.name}, prefers ${idx % 2 === 0 ? 'morning' : 'afternoon'} cleans`,
      extracted_at: isoMinus((idx + 1) * ms.day),
      status,
      first_contact: isoMinus((idx + 1) * ms.day - 2 * ms.hour),
      last_text_date: isoMinus((idx + 1) * ms.day - 4 * ms.hour),
      last_text_body: 'Thanks! We can send pricing and availability shortly.',
      created_at: isoMinus((idx + 2) * ms.day),
      org_id: ORG_ID,
    }
  })

  await upsertRows('dialpad_emails', leads.map((lead, idx) => ({
    id: lead.email_id,
    message_id: `msg_email_${idx + 100}`,
    direction: 'inbound',
    subject: 'Cleaning enquiry',
    from_email: lead.email,
    to_email: 'sales@company.test',
    created_at: lead.created_at,
    body: `Hi, I'm ${lead.name}. Looking for a ${pick(services, idx)} clean in ${pick(suburbs, idx).name}.`,
    summary: `Lead enquiry from ${lead.name}.`,
    org_id: ORG_ID,
  })))

  await upsertRows('dialpad_calls', leads.slice(0, 10).map((lead, idx) => ({
    id: uuidFromSeed(`call-${idx + 1}`),
    call_id: `call_${2000 + idx}`,
    direction: 'inbound',
    duration: 180 + idx * 15,
    created_at: isoMinus((idx + 1) * ms.day - ms.hour),
    transcript: 'Caller asked about availability and pricing.',
    summary: `Inbound call from ${lead.name}.`,
    transcript_fetched_at: isoMinus((idx + 1) * ms.day - ms.hour),
    external_number: lead.phone_number,
    internal_number: '+61290001111',
    org_id: ORG_ID,
  })))

  await upsertRows('dialpad_sms', leads.slice(0, 12).map((lead, idx) => ({
    id: uuidFromSeed(`sms-${idx + 1}`),
    message_id: `sms_${3000 + idx}`,
    direction: 'outbound',
    created_at: isoMinus((idx + 1) * ms.day - 6 * ms.hour),
    content: `Thanks ${lead.name.split(' ')[0]}! Your quote is in progress.`,
    summary: 'Follow-up SMS sent.',
    external_number: lead.phone_number,
    internal_number: '+61290001111',
    org_id: ORG_ID,
  })))

  await upsertRows('extracted_leads', leads)

  const quoteLeads = leads.filter((lead) => ['Quote Sent', 'Job Won', 'Jobs Completed'].includes(lead.status))
  const quotes = quoteLeads.map((lead, idx) => {
    const suburb = pick(suburbs, idx)
    const service = pick(services, idx)
    const hourlyRate = 55 + (idx % 4) * 5
    const cleanerRate = 32 + (idx % 3) * 3
    const mainHours = 2.5 + (idx % 3) * 0.5
    const addOnHours = idx % 2 === 0 ? 0.5 : 1
    const totalHours = mainHours + addOnHours
    const addOnCost = idx % 2 === 0 ? 30 : 45
    const subtotal = round2(totalHours * hourlyRate + addOnCost)
    const netRevenue = round2(subtotal / 1.1)
    const gst = round2(subtotal - netRevenue)
    const totalIncGst = subtotal
    const cleanerPay = round2(totalHours * cleanerRate)
    const profit = round2(totalIncGst - gst - cleanerPay)
    return {
      id: uuidFromSeed(`quote-${idx + 1}`),
      lead_id: lead.id,
      email_id: lead.email_id,
      quote_number: `Q-${2026}${(idx + 100).toString().slice(-3)}`,
      address: `${10 + idx} Example St, ${suburb.name}`,
      address_lat: suburb.lat,
      address_lng: suburb.lng,
      description: `${service} clean for ${lead.name}`,
      service,
      bedrooms: 2 + (idx % 3),
      bathrooms: 1 + (idx % 2),
      addons: ['kitchen', 'bathroom', idx % 2 === 0 ? 'windows' : 'floors'],
      custom_addons: [{ name: idx % 2 === 0 ? 'Oven clean' : 'Balcony tidy', price: addOnCost }],
      hourly_rate: hourlyRate,
      cleaner_rate: cleanerRate,
      cleaner_rate_type: 'hour',
      main_service_hours: mainHours,
      add_on_hours: addOnHours,
      total_hours: totalHours,
      subtotal,
      discount_amount: 0,
      discount_percentage: 0,
      net_revenue: netRevenue,
      gst,
      total_inc_gst: totalIncGst,
      cleaner_pay: cleanerPay,
      profit,
      margin: round2((profit / totalIncGst) * 100),
      deposit_percentage: 20,
      deposit_amount: round2(totalIncGst * 0.2),
      remaining_balance: round2(totalIncGst * 0.8),
      notes: 'Access via lobby intercom.',
      customer_name: lead.name,
      customer_phone: lead.phone_number,
      customer_email: lead.email,
      share_token: idx % 3 === 0 ? `seed-quote-token-${idx + 1}` : null,
      accepted_at: ['Job Won', 'Jobs Completed'].includes(lead.status) ? isoMinus((idx + 1) * ms.day - 6 * ms.hour) : null,
      accepted_name: ['Job Won', 'Jobs Completed'].includes(lead.status) ? lead.name : null,
      accepted_signature: ['Job Won', 'Jobs Completed'].includes(lead.status) ? lead.name : null,
      accepted_checkbox: ['Job Won', 'Jobs Completed'].includes(lead.status) ? true : null,
      accepted_date: ['Job Won', 'Jobs Completed'].includes(lead.status) ? dateMinusDays(idx + 1) : null,
      accepted_payment_method: ['Jobs Completed'].includes(lead.status) ? 'card_paid' : 'invoice',
      base_quote_id: null,
      quote_scope: 'series_base',
      quote_version: null,
      created_at: isoMinus((idx + 2) * ms.day),
      org_id: ORG_ID,
    }
  })

  await upsertRows('quotes', quotes)

  const repeatLeads = leads.filter((lead) => ['Job Won', 'Jobs Completed'].includes(lead.status))
  const bookingSeries = repeatLeads.map((lead, idx) => {
    const quote = quotes.find((q) => q.lead_id === lead.id)
    const suburb = pick(suburbs, idx)
    const frequency = idx % 3 === 0 ? 1 : idx % 3 === 1 ? 2 : 4
    return {
      id: uuidFromSeed(`series-${idx + 1}`),
      lead_id: lead.id,
      quote_id: quote?.id || null,
      title: `${frequency === 1 ? 'Weekly' : frequency === 2 ? 'Fortnightly' : 'Monthly'} Clean - ${
        lead.name.split(' ')[0]
      }`,
      timezone: 'Australia/Sydney',
      starts_at: isoPlus((idx + 2) * ms.day),
      duration_minutes: 180 + (idx % 3) * 30,
      rrule: frequency === 4 ? 'FREQ=MONTHLY;INTERVAL=1' : `FREQ=WEEKLY;INTERVAL=${frequency}`,
      until_date: datePlusDays(120),
      notes: 'Leave key with concierge.',
      status: 'active',
      service_address: `${10 + idx} Example St, ${suburb.name}`,
      service_lat: suburb.lat,
      service_lng: suburb.lng,
      created_at: isoMinus((idx + 3) * ms.day),
      updated_at: isoMinus((idx + 1) * ms.day),
      org_id: ORG_ID,
    }
  })

  await upsertRows('booking_series', bookingSeries)

  const occurrences = bookingSeries.flatMap((series, idx) => {
    const quote = quotes.find((q) => q.lead_id === series.lead_id)
    const cleaner = pick(cleaners, idx)
    const baseStart = new Date(now.getTime() + (idx + 2) * ms.day)
    const completedStart = new Date(baseStart.getTime() - 12 * ms.day)
    const completedEnd = new Date(completedStart.getTime() + 3 * ms.hour)
    const upcomingStart = new Date(baseStart.getTime() + 7 * ms.day)
    const upcomingEnd = new Date(upcomingStart.getTime() + 3 * ms.hour)

    return [
      {
        id: uuidFromSeed(`occ-completed-${idx + 1}`),
        series_id: series.id,
        start_at: completedStart.toISOString(),
        end_at: completedEnd.toISOString(),
        status: 'completed',
        notes: 'Completed with special attention to bathrooms.',
        cleaner_id: cleaner.id,
        assigned_at: isoMinus((idx + 4) * ms.day),
        assigned_notes: `Assigned to ${cleaner.full_name}.`,
        quote_id: quote?.id || null,
        payment_status: 'paid',
        payment_link: `https://pay.example.test/receipt/occ-${idx + 1}`,
        payment_amount_cents: Math.round((quote?.total_inc_gst || 200) * 100),
        payment_notes: 'Paid by card.',
        payment_paid_at: isoMinus((idx + 3) * ms.day),
        created_at: isoMinus((idx + 5) * ms.day),
        updated_at: isoMinus((idx + 4) * ms.day),
        org_id: ORG_ID,
      },
      {
        id: uuidFromSeed(`occ-upcoming-${idx + 1}`),
        series_id: series.id,
        start_at: upcomingStart.toISOString(),
        end_at: upcomingEnd.toISOString(),
        status: 'scheduled',
        notes: 'Next visit scheduled.',
        cleaner_id: cleaner.id,
        assigned_at: isoMinus((idx + 1) * ms.day),
        assigned_notes: `Confirmed with ${cleaner.full_name}.`,
        quote_id: quote?.id || null,
        payment_status: idx % 2 === 0 ? 'invoice_sent' : 'waiting_payment',
        payment_link: `https://pay.example.test/invoice/occ-${idx + 1}`,
        payment_amount_cents: Math.round((quote?.total_inc_gst || 200) * 100),
        payment_notes: idx % 2 === 0 ? 'Invoice sent.' : 'Awaiting payment.',
        payment_paid_at: null,
        created_at: isoMinus((idx + 2) * ms.day),
        updated_at: isoMinus((idx + 1) * ms.day),
        org_id: ORG_ID,
      },
    ]
  })

  await upsertRows('booking_occurrences', occurrences)

  const completedOccurrences = occurrences.filter((occ) => occ.status === 'completed')

  await upsertRows('cleaner_job_reviews', completedOccurrences.map((occ, idx) => ({
    id: uuidFromSeed(`review-${idx + 1}`),
    occurrence_id: occ.id,
    cleaner_id: occ.cleaner_id,
    rating: 4 + (idx % 2),
    notes: 'Great communication and attention to detail.',
    created_at: isoMinus((idx + 2) * ms.day),
    org_id: ORG_ID,
  })))

  await upsertRows('payment_sms_logs', completedOccurrences.map((occ, idx) => ({
    id: uuidFromSeed(`paylog-${idx + 1}`),
    occurrence_id: occ.id,
    body: `Thanks for choosing us! Your total is $${
      (occ.payment_amount_cents || 0) / 100
    }. Pay here: ${occ.payment_link}`,
    tone: 'friendly',
    amount_cents: occ.payment_amount_cents,
    sent_at: isoMinus((idx + 2) * ms.day),
    created_at: isoMinus((idx + 2) * ms.day),
    org_id: ORG_ID,
  })))

  await upsertRows('review_sms_logs', completedOccurrences.map((occ, idx) => ({
    id: uuidFromSeed(`reviewlog-${idx + 1}`),
    occurrence_id: occ.id,
    body: 'Thanks again! If you have a moment, please leave a review: https://review.example.test/demo',
    tone: 'friendly',
    sent_at: isoMinus((idx + 1) * ms.day),
    created_at: isoMinus((idx + 1) * ms.day),
    org_id: ORG_ID,
  })))

  const marketingLeads = leads.filter((lead) => lead.status === 'Marketing Loop')
  const emailTemplateId = await fetchTemplateId('marketing_email_templates', 1, 1)
  const smsTemplateId = await fetchTemplateId('marketing_sms_templates', 1, 1)

  const marketingEmailJourneys = marketingLeads.map((lead, idx) => ({
    id: uuidFromSeed(`email-journey-${idx + 1}`),
    lead_id: lead.id,
    status: 'active',
    current_step: 2,
    next_send_at: isoPlus((idx + 2) * ms.day),
    started_at: isoMinus((idx + 4) * ms.day),
    updated_at: isoMinus((idx + 1) * ms.day),
    org_id: ORG_ID,
  }))

  await upsertRows('marketing_email_journeys', marketingEmailJourneys)

  if (emailTemplateId) {
    await upsertRows(
      'marketing_email_logs',
      marketingEmailJourneys.map((journey, idx) => ({
        id: uuidFromSeed(`email-log-${idx + 1}`),
        journey_id: journey.id,
        lead_id: journey.lead_id,
        step: 1,
        attempt: 1,
        template_id: emailTemplateId,
        subject: 'Quick follow-up',
        body: 'Hi there, just checking if you still need cleaning help.',
        status: 'sent',
        scheduled_for: isoMinus((idx + 3) * ms.day),
        sent_at: isoMinus((idx + 3) * ms.day),
        created_at: isoMinus((idx + 3) * ms.day),
        org_id: ORG_ID,
      }))
    )
  }

  const marketingSmsJourneys = marketingLeads.map((lead, idx) => ({
    id: uuidFromSeed(`sms-journey-${idx + 1}`),
    lead_id: lead.id,
    status: 'active',
    current_step: 1,
    next_send_at: isoPlus((idx + 1) * ms.day),
    started_at: isoMinus((idx + 2) * ms.day),
    updated_at: isoMinus((idx + 1) * ms.day),
    org_id: ORG_ID,
  }))

  await upsertRows('marketing_sms_journeys', marketingSmsJourneys)

  if (smsTemplateId) {
    await upsertRows(
      'marketing_sms_logs',
      marketingSmsJourneys.map((journey, idx) => ({
        id: uuidFromSeed(`sms-log-${idx + 1}`),
        journey_id: journey.id,
        lead_id: journey.lead_id,
        template_id: smsTemplateId,
        step: 1,
        body: 'Hi there! Just checking in about your cleaning enquiry.',
        tone: 'friendly',
        sent_at: isoMinus((idx + 2) * ms.day),
        status: 'sent',
        error: null,
        message_id: `sms_seed_${idx + 10}`,
        created_at: isoMinus((idx + 2) * ms.day),
        org_id: ORG_ID,
      }))
    )
  }

  await upsertRows('todos', [
    {
      id: uuidFromSeed('todo-1'),
      type: 'manual',
      reference_id: leads[0].id,
      reference_type: 'extracted_leads',
      title: `Call back ${leads[0].name}`,
      description: 'Follow up on quote details.',
      is_completed: false,
      due_date: datePlusDays(1),
      auto_generated: false,
      roll_over: true,
      created_at: isoMinus(6 * ms.hour),
      updated_at: isoMinus(6 * ms.hour),
      org_id: ORG_ID,
    },
    {
      id: uuidFromSeed('todo-2'),
      type: 'unassigned_job',
      reference_id: occurrences.find((occ) => occ.status === 'scheduled')?.id || null,
      reference_type: 'booking_occurrences',
      title: 'Assign cleaner for upcoming booking',
      description: 'Upcoming booking needs confirmation.',
      is_completed: false,
      due_date: datePlusDays(2),
      auto_generated: true,
      roll_over: true,
      created_at: isoMinus(10 * ms.hour),
      updated_at: isoMinus(10 * ms.hour),
      org_id: ORG_ID,
    },
  ])

  await upsertRows(
    'daily_summary_logs',
    [1, 2, 3, 4].map((dayOffset) => ({
      summary_date: dateMinusDays(dayOffset),
      timezone: 'Australia/Sydney',
      sent_at: isoMinus(dayOffset * ms.day - 2 * ms.hour),
      payload: {
        leads: 8 + dayOffset,
        quotes: 5 + dayOffset,
        bookings: 3 + dayOffset,
        revenue: 250 + dayOffset * 120,
      },
      org_id: ORG_ID,
    })),
    'summary_date'
  )
}

run()
  .then(() => {
    console.log('Demo data seeded successfully.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

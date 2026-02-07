import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
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

const ORG_ID = '00000000-0000-0000-0000-000000000001'

const now = new Date()
const ms = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
}
const isoMinus = (milliseconds) => new Date(now.getTime() - milliseconds).toISOString()
const isoPlus = (milliseconds) => new Date(now.getTime() + milliseconds).toISOString()
const dateMinusDays = (days) => new Date(now.getTime() - days * ms.day).toISOString().slice(0, 10)
const datePlusDays = (days) => new Date(now.getTime() + days * ms.day).toISOString().slice(0, 10)

async function upsertRows(table, rows, onConflict = 'id') {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows, {
    onConflict,
    ignoreDuplicates: true,
  })
  if (error) {
    throw new Error(`Failed to upsert into ${table}: ${error.message}`)
  }
}

async function run() {
  // Ensure default org exists (no-op if already there)
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

  await upsertRows('dialpad_emails', [
    {
      id: '1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
      message_id: 'msg_email_003',
      direction: 'inbound',
      subject: 'Fortnightly clean enquiry',
      from_email: 'jessie.smith@example.com',
      to_email: 'sales@company.test',
      created_at: isoMinus(4 * ms.day),
      body: 'Hi, I am Jessie. Looking for a fortnightly clean for a 3 bed, 2 bath in Bondi.',
      summary: 'Jessie Smith requested a fortnightly clean in Bondi.',
      org_id: ORG_ID,
    },
  ])

  await upsertRows('dialpad_calls', [
    {
      id: '2f2f2f2f-2f2f-2f2f-2f2f-2f2f2f2f2f2f',
      call_id: 'call_1002',
      direction: 'inbound',
      duration: 312,
      created_at: isoMinus(3 * ms.day),
      transcript: 'Caller confirmed fortnightly booking and asked about eco-friendly products.',
      summary: 'Jessie confirmed booking details and product preference.',
      transcript_fetched_at: isoMinus(3 * ms.day),
      external_number: '+61400222333',
      internal_number: '+61290001111',
      org_id: ORG_ID,
    },
  ])

  await upsertRows('dialpad_sms', [
    {
      id: '3f3f3f3f-3f3f-3f3f-3f3f-3f3f3f3f3f3f',
      message_id: 'sms_2002',
      direction: 'outbound',
      created_at: isoMinus(2 * ms.day),
      content: 'Thanks Jessie! Your quote and schedule are ready. Let me know if you want any changes.',
      summary: 'Quote follow-up SMS sent.',
      external_number: '+61400222333',
      internal_number: '+61290001111',
      org_id: ORG_ID,
    },
  ])

  await upsertRows('extracted_leads', [
    {
      id: '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
      email_id: '1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
      name: 'Jessie Smith',
      phone_number: '+61400222333',
      email: 'jessie.smith@example.com',
      region_notes: 'Bondi, prefers Friday mornings, eco-friendly supplies',
      extracted_at: isoMinus(4 * ms.day),
      status: 'Job Won',
      first_contact: isoMinus(3 * ms.day),
      last_text_date: isoMinus(2 * ms.day),
      last_text_body:
        'Thanks Jessie! Your quote and schedule are ready. Let me know if you want any changes.',
      created_at: isoMinus(4 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('quotes', [
    {
      id: '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
      lead_id: '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
      email_id: '1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
      quote_number: 'B2026-021',
      address: '45 Campbell Parade, Bondi NSW',
      address_lat: -33.8915,
      address_lng: 151.2767,
      description: 'Fortnightly maintenance clean',
      service: 'standard',
      bedrooms: 3,
      bathrooms: 2,
      addons: ['kitchen', 'bathroom', 'floors'],
      custom_addons: [{ name: 'Balcony tidy', price: 25 }],
      hourly_rate: 65.0,
      cleaner_rate: 38.0,
      cleaner_rate_type: 'hour',
      main_service_hours: 3.5,
      add_on_hours: 0.5,
      total_hours: 4.0,
      subtotal: 260.0,
      discount_amount: 0.0,
      discount_percentage: 0.0,
      net_revenue: 236.36,
      gst: 23.64,
      total_inc_gst: 260.0,
      cleaner_pay: 152.0,
      profit: 84.36,
      margin: 32.45,
      deposit_percentage: 20.0,
      deposit_amount: 52.0,
      remaining_balance: 208.0,
      notes: 'Use side gate access.',
      customer_name: 'Jessie Smith',
      customer_phone: '+61400222333',
      customer_email: 'jessie.smith@example.com',
      share_token: 'seed-quote-token-jessie',
      accepted_at: isoMinus(2 * ms.day),
      accepted_name: 'Jessie Smith',
      accepted_signature: 'Jessie Smith',
      accepted_checkbox: true,
      accepted_date: dateMinusDays(2),
      accepted_payment_method: 'invoice',
      base_quote_id: null,
      quote_scope: 'series_base',
      quote_version: null,
      created_at: isoMinus(4 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('cleaners', [
    {
      id: '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
      full_name: 'Morgan Patel',
      phone: '+61400999111',
      email: 'morgan.patel@example.com',
      base_location_text: 'Bondi NSW',
      base_lat: -33.8915,
      base_lng: 151.2767,
      bank_account_name: 'Morgan Patel',
      bank_bsb: '062000',
      bank_account_number: '87654321',
      rates: { standard: 50, deep: 60, end_of_lease: 70 },
      availability: {
        Tue: { Morning: true, Afternoon: true },
        Thu: { Morning: true },
        Fri: { Morning: true, Afternoon: true },
      },
      has_transport: true,
      transport_type: 'car',
      org_id: ORG_ID,
    },
  ])

  await upsertRows('booking_series', [
    {
      id: '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f',
      lead_id: '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
      quote_id: '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
      title: 'Fortnightly Clean - Jessie',
      timezone: 'Australia/Sydney',
      starts_at: isoPlus(5 * ms.day),
      duration_minutes: 240,
      rrule: 'FREQ=WEEKLY;INTERVAL=2',
      until_date: datePlusDays(90),
      notes: 'Call on arrival, side gate access.',
      status: 'active',
      service_address: '45 Campbell Parade, Bondi NSW',
      service_lat: -33.8915,
      service_lng: 151.2767,
      created_at: isoMinus(3 * ms.day),
      updated_at: isoMinus(1 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('booking_occurrences', [
    {
      id: '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
      series_id: '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f',
      start_at: isoMinus(7 * ms.day),
      end_at: isoMinus(7 * ms.day - 4 * ms.hour),
      status: 'completed',
      notes: 'Completed with balcony tidy.',
      cleaner_id: '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
      assigned_at: isoMinus(8 * ms.day),
      assigned_notes: 'Assigned to Morgan.',
      quote_id: '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
      payment_status: 'paid',
      payment_link: 'https://pay.example.test/receipt/occ-jessie-1',
      payment_amount_cents: 26000,
      payment_notes: 'Paid via invoice.',
      payment_paid_at: isoMinus(6 * ms.day),
      created_at: isoMinus(8 * ms.day),
      updated_at: isoMinus(7 * ms.day),
      org_id: ORG_ID,
    },
    {
      id: '8f8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f',
      series_id: '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f',
      start_at: isoPlus(7 * ms.day),
      end_at: isoPlus(7 * ms.day + 4 * ms.hour),
      status: 'scheduled',
      notes: 'Bring eco-friendly supplies.',
      cleaner_id: '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
      assigned_at: isoMinus(1 * ms.day),
      assigned_notes: 'Confirmed with Morgan.',
      quote_id: '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
      payment_status: 'invoice_sent',
      payment_link: 'https://pay.example.test/invoice/occ-jessie-2',
      payment_amount_cents: 26000,
      payment_notes: 'Invoice sent.',
      payment_paid_at: null,
      created_at: isoMinus(2 * ms.day),
      updated_at: isoMinus(1 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('cleaner_job_reviews', [
    {
      id: 'afafafaf-afaf-afaf-afaf-afafafafafaf',
      occurrence_id: '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
      cleaner_id: '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
      rating: 4,
      notes: 'Great communication and tidy finish.',
      created_at: isoMinus(6 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('payment_sms_logs', [
    {
      id: 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
      occurrence_id: '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
      body: 'Thanks Jessie! Your total is $260.00. Pay here: https://pay.example.test/receipt/occ-jessie-1',
      tone: 'friendly',
      amount_cents: 26000,
      sent_at: isoMinus(6 * ms.day),
      created_at: isoMinus(6 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('review_sms_logs', [
    {
      id: 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
      occurrence_id: '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
      body: 'Thanks again Jessie! If you have a moment, please leave a review: https://review.example.test/jessie',
      tone: 'friendly',
      sent_at: isoMinus(5 * ms.day),
      created_at: isoMinus(5 * ms.day),
      org_id: ORG_ID,
    },
  ])

  await upsertRows('todos', [
    {
      id: 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
      type: 'manual',
      reference_id: '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
      reference_type: 'extracted_leads',
      title: 'Confirm access details for Jessie Smith',
      description: 'Verify side gate code and parking instructions.',
      is_completed: false,
      due_date: datePlusDays(2),
      auto_generated: false,
      roll_over: true,
      created_at: isoMinus(4 * ms.hour),
      updated_at: isoMinus(4 * ms.hour),
      org_id: ORG_ID,
    },
  ])
}

run()
  .then(() => {
    console.log('Jessie Smith seed data inserted successfully.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

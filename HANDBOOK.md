## Little Fish Operations Handbook

This document describes the full end-to-end user journey, page by page, how sections interact, and how Supabase tables connect. It is based on the current app in `src/`.

---

## 1) Start-to-End User Journey (Full Flow)

1) Sign in  
   - The app opens to a simple login gate. The session is stored in `localStorage` and checked on load.
   - Once signed in, you land on the dashboard (`/`).

2) Inbound emails and new leads  
   - Use **Dashboard → Sync Emails** to pull recent Outlook emails via the `outlook-email-sync` Edge Function.  
   - Emails appear in the communications feed (calls/SMS/emails).  
   - Open an email and click **Extract Lead** (Lead modal). This calls `extract-lead-info` and creates an `extracted_leads` record linked to the email.
   - New leads trigger the **New Lead Notifier** popup in real time.

3) Manage the lead pipeline  
   - Open **Sales Funnel** (`/salesfunnel`) to move leads across statuses.
   - Call or SMS the lead directly (Dialpad) from each card.
   - Create a quote for the lead (opens QuoteTool).
   - When a lead is moved to **Job Won**, the booking modal appears to schedule the first service.

4) Create and share quotes  
   - Use **QuoteTool** (from Dashboard, Sales Funnel, or Job Modal) to calculate pricing and save a quote.
   - Share a public quote link (uses `share_token`). Customers view the public quote at `/?quote=<token>`.
   - Customers can accept by direct transfer or pay by card (Stripe payment link).

5) Schedule and manage bookings  
   - Creating a booking generates a `booking_series` and its `booking_occurrences`.
   - View and manage all jobs in **Calendar** (`/calendar`):
     - Reschedule via drag/drop.
     - Set job status (scheduled/completed/skipped/cancelled).
     - Assign cleaners and update service address.
   - Every booking is tied to its lead and (ideally) a specific quote.

6) Dispatch and assignment  
   - **Dispatch** (`/dispatch`) shows jobs on a map and lets you assign cleaners.
   - Unassigned jobs show clearly; assign a cleaner to update `booking_occurrences.cleaner_id`.
   - Bulk SMS cleaners from Dispatch.

7) Complete jobs and handle payments  
   - **Completed Jobs** (`/completed`) lists completed jobs and past-due jobs.
   - Create Stripe payment links per job, mark as paid, and send payment/reminder SMS.
   - Payment status updates `booking_occurrences.payment_status` and syncs with quotes.

8) Pay cleaners  
   - **Cleaners Payout** (`/cleaners-payout`) computes payouts for completed jobs and tracks paid/unpaid.
   - Mark payouts as paid to update `cleaner_payouts.paid_at`.

9) Retention / recurring revenue  
   - **Repeat Customers** (`/repeat-customers`) aggregates recurring bookings and monthly revenue estimates from `booking_series`.

10) End-of-day checklist  
   - **Todo** (`/todo`) aggregates auto items (lead status, unassigned jobs, past due unpaid, unpaid payouts) plus manual todos.
   - Use **Manual Todo Popup** on any page for quick personal tasks.

---

## 2) Global UI + Cross-Section Interactions

These components appear across most pages and drive cross-page behavior:

- **MainNav**: Links to all pages and shows pending todo count.
- **Global Search**: Ctrl/Cmd+K opens search across Leads, Bookings, Cleaners.
- **New Lead Notifier**: Real-time popup for new `extracted_leads` inserts.
- **Manual Todo Popup**: Quick access to `todos` (manual tasks) anywhere.
- **JobModal**: Global job details modal (opens via `open-job-modal` event).
- **Breadcrumbs**: Shows current page path.

Cross-section effects:
- Updating a lead status or creating a booking affects the Sales Funnel, Calendar, Dispatch, and Todo counts.
- Assigning a cleaner changes job visibility in Dispatch/Calendar and drives payouts in Cleaners Payout.
- Payment updates in Completed Jobs update quote payment state (and vice versa) via database triggers.
- Quote address updates feed into booking/dispatch address pins.

---

## 3) Page-by-Page Breakdown

### Dashboard (`/`)
Purpose: Operations overview, communications, and lead triage.

Main sections:
- **KPI Metrics + Charts**: Counts of calls, SMS, emails, leads, quotes.
- **Communications Log**: Calls/SMS/emails across Dialpad + Outlook.
- **Lead List & Actions**: Call, SMS, update status, create quote, create booking.
- **Email Sync**: Triggers `outlook-email-sync` and checks webhook status.
- **Webhook Debug**: Recent raw webhook payloads from `webhook_logs`.

Tables used:
- `dialpad_calls`, `dialpad_sms`, `dialpad_emails`
- `extracted_leads`, `quotes`
- `webhook_logs`

Side effects:
- Extracting a lead creates `extracted_leads`.
- Calling/SMS updates lead timestamps (`first_contact`, `last_text_date`).

---

### Sales Funnel (`/salesfunnel`)
Purpose: Move leads through pipeline stages.

Main sections:
- **Kanban columns** for lead status.
- **Actions**: Call, SMS, Quote, and Schedule.

Tables used:
- `extracted_leads`
- `quotes` (via QuoteTool modal)
- `booking_series` / `booking_occurrences` (via BookingModal)

Side effects:
- Moving a lead to **Job Won** opens BookingModal to create bookings.
- Moving a lead to **Marketing Loop** automatically starts SMS + email journeys.
- Moving a lead away from **Marketing Loop** automatically cancels journeys.
- Updating status uses the `update-lead-status` Edge Function.

---

### Marketing Loop (`/marketing-loop`)
Purpose: Monitor and manage automated SMS + email re-engagement campaigns.

Main sections:
- **Lead list** with status indicators (green = active early/mid, orange = active near end, red = completed/paused/cancelled).
- **Journey details** per lead: current step, next send time, last send time.
- **Action buttons**: Pause/Resume, Stop, Send next now.

Tables used:
- `extracted_leads` (filtered by status = 'Marketing Loop')
- `marketing_sms_journeys`, `marketing_sms_logs`, `marketing_sms_templates`
- `marketing_email_journeys`, `marketing_email_logs`, `marketing_email_templates`

Journey schedules:
- **SMS**: Step 1 (immediate), Step 2 (+3 days), Step 3 (+7 days), Step 4 (+14 days), Step 5 (+14 days), Step 6 (+1 month), Step 7 (+1 month).
- **Email**: Step 1 (+1 day), Step 2 (+5 days), Step 3 (+14 days), Step 4 (+32 days), Step 5 (+44 days), Step 6 (+79 days), Step 7 (+121 days).

Side effects:
- Journeys auto-start when lead status changes to "Marketing Loop".
- Journeys auto-cancel when lead status changes away from "Marketing Loop".
- The `marketing-loop-runner` cron function sends due messages hourly.

---

### Quotes Sent (`/quotes-sent`)
Purpose: View all saved quotes and their status.

Main sections:
- Summary cards (total, paid, pending)
- Search & filters
- Quote list with share links

Tables used:
- `quotes` (joined to `extracted_leads`)

Side effects:
- None (read-only list + copy/share links).

---

### Calendar (`/calendar`)
Purpose: All scheduled jobs in a calendar view.

Main sections:
- FullCalendar with drag/drop scheduling.
- Event details modal with:
  - Job status changes
  - Cleaner assignment
  - Address updates
  - Quote summary snapshot
  - Review prompt on completion

Tables used:
- `booking_occurrences`
- `booking_series` (+ `extracted_leads`)
- `cleaners`
- `cleaner_job_reviews`
- `quotes` (for job summary)

Side effects:
- Changing status updates `booking_occurrences.status`.
- Assigning a cleaner updates `booking_occurrences.cleaner_id`.
- Completing a job can create a `cleaner_job_reviews` entry.

---

### Dispatch (`/dispatch`)
Purpose: Assign cleaners using map + job lists.

Main sections:
- Map (jobs + cleaner locations)
- Unassigned jobs list
- Assigned jobs list
- Cleaner panel with availability/reviews
- Bulk SMS to cleaners

Tables used:
- `booking_occurrences`
- `booking_series` (+ `extracted_leads`)
- `quotes` (address pins / job totals)
- `cleaners`
- `cleaner_job_reviews` (ratings)

Side effects:
- Assigning cleaner updates `booking_occurrences.cleaner_id`.
- Bulk SMS uses Dialpad API (no table write).

---

### Cleaners (`/cleaners`)
Purpose: Onboard/maintain cleaner profiles.

Tables used:
- `cleaners`

Side effects:
- Updating cleaner data impacts Dispatch assignment and Payouts.

---

### Completed Jobs (`/completed`)
Purpose: Billing, payment, and review follow-ups.

Main sections:
- Filtered job list (completed + past-due)
- Payment status controls
- Stripe payment links
- Call/SMS reminder tools
- Notes per job

Tables used:
- `booking_occurrences`
- `booking_series`
- `quotes`
- `extracted_leads`
- `payment_sms_templates`, `payment_sms_logs`
- `review_sms_templates`, `review_sms_logs`
- `dialpad_calls` (last call info)

Side effects:
- Payment status updates `booking_occurrences.payment_status`/`payment_paid_at`.
- Stripe payment links written to `booking_occurrences.payment_link`.
- SMS reminders logged to `payment_sms_logs`/`review_sms_logs`.

Manual Payment (Direct Debit)
- “Mark as paid” is used for direct debit after funds are confirmed received/cleared.
- This action updates:
  - `booking_occurrences.payment_status = 'paid'`
  - `booking_occurrences.payment_paid_at = now()`
  - and syncs the linked quote to paid via trigger.
- Manual direct debit confirmations should be logged (who + when + note/reference).

---

### Cleaners Payout (`/cleaners-payout`)
Purpose: Track cleaner pay and profit.

Tables used:
- `booking_occurrences`
- `booking_series`
- `quotes`
- `cleaners`
- `cleaner_payouts`

Side effects:
- Missing `cleaner_payouts` records are auto-created.
- Marking paid updates `cleaner_payouts.paid_at`.

---

### Repeat Customers (`/repeat-customers`)
Purpose: Recurring revenue visibility.

Tables used:
- `booking_series` (+ `extracted_leads`)
- `quotes` (to estimate revenue)

Side effects:
- None (read-only aggregation).

---

### Todo (`/todo`)
Purpose: End-of-day checklist with auto and manual tasks.

Auto sections:
- Leads without status today
- Unassigned jobs in next 5 days
- Past-due unpaid jobs
- Unpaid cleaner payouts (weekly)

Manual section:
- `todos` with add/complete/delete

Tables used:
- `extracted_leads`
- `booking_occurrences`
- `quotes`
- `cleaner_payouts`
- `todos`

Side effects:
- Updating lead status writes to `extracted_leads`.
- Marking payout paid writes to `cleaner_payouts`.
- Manual todos CRUD in `todos`.

---

### Public Quote (`/?quote=<token>`)
Purpose: Customer-facing quote acceptance and payment.

Tables used:
- `quotes`
- `extracted_leads` (status update on payment)

Side effects:
- Acceptance updates `quotes.accepted_*` fields.
- Card payment triggers Stripe link and sets `accepted_payment_method`.

---

## 4) Supabase Tables and Relationships

### Core tables
- **`extracted_leads`**: Lead entity (name, phone, email, status, contact timestamps).  
  - Linked to `dialpad_emails` via `email_id` (implied).
- **`quotes`**: Pricing and proposal data, including acceptance and payment fields.  
  - `quotes.lead_id → extracted_leads.id`  
  - `quotes.base_quote_id → quotes.id` (occurrence variants point to their base quote)  
  - `quotes.quote_scope` = `series_base` or `occurrence_variant`
- **`booking_series`**: Recurring or one-time booking agreements.  
  - `booking_series.lead_id → extracted_leads.id`  
  - `booking_series.quote_id → quotes.id` (base quote for the series)
- **`booking_occurrences`**: Individual scheduled jobs generated from series.  
  - `booking_occurrences.series_id → booking_series.id`  
  - `booking_occurrences.quote_id → quotes.id` (occurrence-specific quote variant)  
  - `booking_occurrences.cleaner_id → cleaners.id`
- **`cleaners`**: Cleaner profiles, availability, pricing, and bank info.
- **`cleaner_job_reviews`**: Ratings tied to completed occurrences.  
  - `occurrence_id → booking_occurrences.id`  
  - `cleaner_id → cleaners.id`
- **`cleaner_payouts`**: Payouts per completed occurrence.  
  - `occurrence_id → booking_occurrences.id`  
  - `cleaner_id → cleaners.id`
- **`todos`**: Manual task list (plus auto types).

### Communications tables
- **`dialpad_calls`**: Call logs, transcripts, summaries.
- **`dialpad_sms`**: SMS logs.
- **`dialpad_emails`**: Email logs (from Outlook sync).

### SMS template tables
- **`sms_templates`**: Templates for lead SMS.
- **`payment_sms_templates`**, **`payment_sms_logs`**: Payment reminder templates + send logs.
- **`review_sms_templates`**, **`review_sms_logs`**: Review reminder templates + send logs.

### Debug
- **`webhook_logs`**: Raw webhook payloads for monitoring.

---

## 5) Which Sections Use Which Tables (Quick Map)

- **Dashboard** → `dialpad_calls`, `dialpad_sms`, `dialpad_emails`, `extracted_leads`, `quotes`, `webhook_logs`
- **Sales Funnel** → `extracted_leads`, `quotes`, `booking_series`, `booking_occurrences`
- **Marketing Loop** → `extracted_leads`, `marketing_sms_journeys`, `marketing_sms_logs`, `marketing_email_journeys`, `marketing_email_logs`
- **Quotes Sent** → `quotes`, `extracted_leads`
- **Calendar** → `booking_occurrences`, `booking_series`, `extracted_leads`, `cleaners`, `quotes`, `cleaner_job_reviews`
- **Dispatch** → `booking_occurrences`, `booking_series`, `extracted_leads`, `quotes`, `cleaners`, `cleaner_job_reviews`
- **Cleaners** → `cleaners`
- **Completed Jobs** → `booking_occurrences`, `booking_series`, `quotes`, `extracted_leads`, `payment_sms_*`, `review_sms_*`, `dialpad_calls`
- **Cleaners Payout** → `booking_occurrences`, `booking_series`, `quotes`, `cleaners`, `cleaner_payouts`
- **Repeat Customers** → `booking_series`, `quotes`, `extracted_leads`
- **Todo** → `extracted_leads`, `booking_occurrences`, `quotes`, `cleaner_payouts`, `todos`
- **Manual Todo Popup** → `todos`
- **Communications Log** → `dialpad_calls`, `dialpad_sms`, `dialpad_emails`
- **Public Quote** → `quotes`, `extracted_leads`
- **Marketing Loop** → `extracted_leads`, `marketing_sms_journeys`, `marketing_sms_logs`, `marketing_email_journeys`, `marketing_email_logs`

---

## 6) Key Data Sync Rules and Triggers

### Database Constraints (Enforced)

- **`booking_series.quote_id` is NOT NULL** — Every booking MUST have a linked quote. This is enforced at the database level.
- **`booking_series.lead_id` is NOT NULL** — Every booking MUST have a linked lead.

### Active Triggers

| Trigger | Table | Effect |
|---------|-------|--------|
| `trg_mark_occurrences_paid_from_quote` | `quotes` | Quote paid → occurrences with `quote_id = quotes.id` marked paid |
| `trg_sync_quote_paid_from_occurrence` | `booking_occurrences` | Occurrence paid → linked quote marked paid |
| `trg_set_occ_payment_from_quote` | `booking_occurrences` | New occurrences inherit paid state only if their linked quote is already paid |
| `trg_sync_booking_series_from_quote` | `quotes` | Quote save → syncs address/coords to booking_series |
| `ensure_occurrence_completed_for_review` | `cleaner_job_reviews` | Review only allowed if occurrence is completed |

### Sync Behaviors

- **Quote ↔ Booking Sync**
  - `booking_series.quote_id` points to the base quote for the series (required).
  - Each occurrence gets its own quote variant (`booking_occurrences.quote_id`) for receipts and per-visit price adjustments.
  - Quote address/coords auto-sync into `booking_series.service_address` for Dispatch/Map pins via trigger.

- **Payment Sources**
  - **Card (Stripe)**: Paid state is set by `stripe-webhook` (authoritative).
  - **Direct Debit**: Paid state is set manually by staff after confirming the debit has cleared (authoritative for direct debit).

- **Payment Sync Rules**
  - When a quote is marked paid, only occurrences linked to that exact quote are marked paid.
  - When an occurrence is marked paid manually (direct debit confirmation), the occurrence's linked quote is updated to paid.
  - New occurrences inherit paid state only if their linked quote is already paid (rare; per-visit variants default unpaid).

- **Review Guard**
  - A `cleaner_job_reviews` record can only be inserted if the occurrence status is `completed`.

---

## 7) Supabase Edge Functions + External Integrations

### Edge Functions (in repo)
- `create-booking-series`: Creates `booking_series` + `booking_occurrences` and syncs quote address.
- `create-payment-link`: Generates Stripe payment links.
- `create-payment-intent`: Creates Stripe payment intents (not used in UI yet).
- `stripe-webhook`: Marks quotes/occurrences as paid on Stripe events.
- `update-lead-status`: Updates `extracted_leads.status` and auto-starts/stops Marketing Loop journeys.
- `get-mapbox-token`: Returns Mapbox token for client-side geocoding.
- `setup-outlook-webhook`: Creates/list/renew Outlook webhook subscriptions.
- `marketing-loop-actions`: Manages Marketing Loop journeys (start, pause, resume, cancel, set step).
- `marketing-loop-runner`: Cron function that sends due SMS/email steps (should run hourly).

### Edge Functions (referenced by UI, not present in repo)
- `outlook-email-sync`: Pulls Outlook emails into `dialpad_emails`.
- `outlook-webhook`: Receives real-time Outlook email notifications.
- `extract-lead-info`: Parses a dialpad email into `extracted_leads`.
- `get-transcript-summary`: Fetches Dialpad transcripts and generates AI summaries.

### External APIs
- **Dialpad**: Calls + SMS (browser-side API usage).
- **Stripe**: Payments via payment links & webhooks.
- **Mapbox**: Address lookup + map pins.
- **Microsoft Graph**: Outlook email sync/webhooks.
- **Resend**: Email delivery for Marketing Loop campaigns.

### Scheduled Functions (Cron)

**Marketing Loop Runner** (`marketing-loop-runner`):
- **Purpose**: Sends due SMS and email messages from Marketing Loop journeys.
- **Schedule**: Should run **hourly** (every 1 hour).
- **Setup**:
  1. Go to Supabase Dashboard → Database → Cron Jobs (or use pg_cron extension)
  2. Create a cron job that calls the Edge Function:
     ```sql
     SELECT cron.schedule(
       'marketing-loop-runner',
       '0 * * * *', -- Every hour at minute 0
       $$
       SELECT net.http_post(
         url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/marketing-loop-runner',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
         ),
         body := '{}'::jsonb
       ) AS request_id;
       $$
     );
     ```
  3. Alternatively, use Supabase Dashboard → Edge Functions → `marketing-loop-runner` → Settings → Schedule
- **Required Secrets**: `DIALPAD_API_KEY`, `RESEND_API_KEY`, `DIALPAD_USER_ID` (optional, defaults to `6452247499866112`)

---

## 8) Practical “How-To” Cheatsheet

- **New lead from email**
  - Dashboard → Sync Emails → Open email → Extract lead → Lead appears in Sales Funnel.

- **Send quote**
  - Sales Funnel → Quote → Save → Copy share link → Send to customer.

- **Win and schedule**
  - Sales Funnel → Move to “Job Won” → Booking modal → Create booking.

- **Assign cleaner**
  - Dispatch → Unassigned jobs → Assign cleaner.

- **Mark job completed**
  - Calendar → Click job → Status → Completed → (optional) review prompt.

- **Collect payment**
  - Completed Jobs → Create payment link → Send payment SMS → Mark paid.

- **Pay cleaner**
  - Cleaners Payout → Mark payout paid.

- **Close out the day**
  - Todo page → Clear all sections and manual tasks.

- **Enroll lead in Marketing Loop**
  - Sales Funnel → Drag lead to "Marketing Loop" column → Journeys auto-start.
  - Marketing Loop page → View journey status, pause/resume, or stop.

---

## 9) Notes / Gotchas

- Some tables (e.g., `extracted_leads`, `quotes`, `dialpad_*`, `sms_templates`, `cleaner_payouts`) are expected to exist outside the migrations in this repo.
- The UI currently uses a simple localStorage auth gate, not Supabase Auth.
- **Payment sync is enforced per quote ↔ occurrence** — base series quotes and per-visit quote variants are separate; paying one occurrence does not mark the entire series paid.
- **Bookings require quotes** — `booking_series.quote_id` is NOT NULL. You cannot create a booking without first creating a quote for the lead.


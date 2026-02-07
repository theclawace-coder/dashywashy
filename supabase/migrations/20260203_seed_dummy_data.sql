-- Dummy data for testing UI flows (idempotent inserts)

-- Core communication logs
INSERT INTO dialpad_emails (
  id,
  message_id,
  direction,
  subject,
  from_email,
  to_email,
  created_at,
  body,
  summary
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'msg_email_001',
    'inbound',
    'Quote request for weekly clean',
    'alex@example.com',
    'sales@company.test',
    now() - interval '3 days',
    'Hi, could I get a quote for a weekly clean in Parramatta? 2 bed, 1 bath.',
    'Customer requesting a weekly clean quote.'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'msg_email_002',
    'inbound',
    'End of lease clean inquiry',
    'jordan@example.com',
    'sales@company.test',
    now() - interval '1 day',
    'We are moving out next week and need an end-of-lease clean.',
    'End-of-lease inquiry for next week.'
  )
ON CONFLICT DO NOTHING;

INSERT INTO dialpad_calls (
  id,
  call_id,
  direction,
  duration,
  created_at,
  transcript,
  summary,
  transcript_fetched_at,
  external_number,
  internal_number
)
VALUES
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'call_1001',
    'inbound',
    245,
    now() - interval '2 days',
    'Caller asked about pricing and availability.',
    'Inbound pricing enquiry.',
    now() - interval '2 days',
    '+61400111222',
    '+61290001111'
  )
ON CONFLICT DO NOTHING;

INSERT INTO dialpad_sms (
  id,
  message_id,
  direction,
  created_at,
  content,
  summary,
  external_number,
  internal_number
)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'sms_2001',
    'outbound',
    now() - interval '6 hours',
    'Thanks for reaching out! We can share pricing today.',
    'Follow-up SMS sent.',
    '+61400111222',
    '+61290001111'
  )
ON CONFLICT DO NOTHING;

-- Leads
INSERT INTO extracted_leads (
  id,
  email_id,
  name,
  phone_number,
  email,
  region_notes,
  extracted_at,
  status,
  first_contact,
  last_text_date,
  last_text_body,
  created_at
)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Alex Brown',
    '+61400111222',
    'alex@example.com',
    'Parramatta, prefers morning cleans',
    now() - interval '3 days',
    'Quote Sent',
    now() - interval '2 days',
    now() - interval '6 hours',
    'Thanks for reaching out! We can share pricing today.',
    now() - interval '3 days'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Jordan Lee',
    '+61400999888',
    'jordan@example.com',
    'CBD apartment, end-of-lease',
    now() - interval '1 day',
    'Marketing Loop',
    now() - interval '1 day',
    null,
    null,
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

-- Quotes (base + variant)
INSERT INTO quotes (
  id,
  lead_id,
  email_id,
  quote_number,
  address,
  address_lat,
  address_lng,
  description,
  service,
  bedrooms,
  bathrooms,
  addons,
  custom_addons,
  hourly_rate,
  cleaner_rate,
  cleaner_rate_type,
  main_service_hours,
  add_on_hours,
  total_hours,
  subtotal,
  discount_amount,
  discount_percentage,
  net_revenue,
  gst,
  total_inc_gst,
  cleaner_pay,
  profit,
  margin,
  deposit_percentage,
  deposit_amount,
  remaining_balance,
  notes,
  customer_name,
  customer_phone,
  customer_email,
  share_token,
  accepted_at,
  accepted_name,
  accepted_signature,
  accepted_checkbox,
  accepted_date,
  accepted_payment_method,
  base_quote_id,
  quote_scope,
  quote_version,
  created_at
)
VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'A1234',
    '123 George St, Parramatta NSW',
    -33.8150,
    151.0020,
    'Weekly maintenance clean',
    'standard',
    2,
    1,
    '["kitchen","bathroom"]'::jsonb,
    '[{"name":"Fridge clean","price":35}]'::jsonb,
    55.00,
    32.00,
    'hour',
    2.5,
    0.5,
    3.0,
    165.00,
    0.00,
    0.00,
    150.00,
    15.00,
    165.00,
    96.00,
    54.00,
    32.73,
    30.00,
    49.50,
    115.50,
    'Access via lobby intercom.',
    'Alex Brown',
    '+61400111222',
    'alex@example.com',
    'seed-quote-token-1',
    now() - interval '2 days',
    'Alex Brown',
    'Alex Brown',
    true,
    (now() - interval '2 days')::date,
    'card_paid',
    null,
    'series_base',
    null,
    now() - interval '3 days'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'A1234v2',
    '123 George St, Parramatta NSW',
    -33.8150,
    151.0020,
    'One-off deep clean variation',
    'deep',
    2,
    1,
    '["kitchen","bathroom","windows"]'::jsonb,
    '[{"name":"Oven clean","price":45}]'::jsonb,
    60.00,
    34.00,
    'hour',
    3.0,
    1.0,
    4.0,
    240.00,
    20.00,
    8.33,
    200.00,
    20.00,
    220.00,
    136.00,
    64.00,
    29.09,
    30.00,
    66.00,
    154.00,
    'Variant for deep clean.',
    'Alex Brown',
    '+61400111222',
    'alex@example.com',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '33333333-3333-3333-3333-333333333333',
    'occurrence_variant',
    2,
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

-- Cleaners
INSERT INTO cleaners (
  id,
  full_name,
  phone,
  email,
  base_location_text,
  base_lat,
  base_lng,
  bank_account_name,
  bank_bsb,
  bank_account_number,
  rates,
  availability,
  has_transport,
  transport_type
)
VALUES
  (
    '88888888-8888-8888-8888-888888888888',
    'Taylor Chen',
    '+61400111333',
    'taylor@example.com',
    'Parramatta NSW',
    -33.8150,
    151.0020,
    'Taylor Chen',
    '062000',
    '12345678',
    '{"standard":45,"deep":55}'::jsonb,
    '{"Mon":{"Morning":true,"Afternoon":true},"Wed":{"Morning":true},"Fri":{"Afternoon":true}}'::jsonb,
    true,
    'car'
  )
ON CONFLICT DO NOTHING;

-- Booking series + occurrences
INSERT INTO booking_series (
  id,
  lead_id,
  quote_id,
  title,
  timezone,
  starts_at,
  duration_minutes,
  rrule,
  until_date,
  notes,
  status,
  service_address,
  service_lat,
  service_lng,
  created_at,
  updated_at
)
VALUES
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'Weekly Clean - Alex',
    'Australia/Sydney',
    now() + interval '2 days',
    180,
    'FREQ=WEEKLY;INTERVAL=1',
    (now() + interval '45 days')::date,
    'Leave key with concierge.',
    'active',
    '123 George St, Parramatta NSW',
    -33.8150,
    151.0020,
    now() - interval '3 days',
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

INSERT INTO booking_occurrences (
  id,
  series_id,
  start_at,
  end_at,
  status,
  notes,
  cleaner_id,
  assigned_at,
  assigned_notes,
  quote_id,
  payment_status,
  payment_link,
  payment_amount_cents,
  payment_notes,
  payment_paid_at,
  created_at,
  updated_at
)
VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    '55555555-5555-5555-5555-555555555555',
    now() - interval '1 day',
    now() - interval '1 day' + interval '3 hours',
    'completed',
    'Deep clean completed.',
    '88888888-8888-8888-8888-888888888888',
    now() - interval '2 days',
    'Assigned for deep clean.',
    '44444444-4444-4444-4444-444444444444',
    'paid',
    'https://pay.example.test/receipt/occ-1',
    22000,
    'Paid by card.',
    now() - interval '1 day',
    now() - interval '2 days',
    now() - interval '1 day'
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    '55555555-5555-5555-5555-555555555555',
    now() + interval '6 days',
    now() + interval '6 days' + interval '3 hours',
    'scheduled',
    'Standard maintenance clean.',
    '88888888-8888-8888-8888-888888888888',
    now() - interval '1 day',
    'Assigned for weekly clean.',
    '33333333-3333-3333-3333-333333333333',
    'invoice_sent',
    'https://pay.example.test/invoice/occ-2',
    16500,
    'Invoice sent.',
    null,
    now() - interval '1 day',
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

-- Cleaner reviews (requires completed occurrence)
INSERT INTO cleaner_job_reviews (
  id,
  occurrence_id,
  cleaner_id,
  rating,
  notes,
  created_at
)
VALUES
  (
    '99999999-9999-9999-9999-999999999999',
    '66666666-6666-6666-6666-666666666666',
    '88888888-8888-8888-8888-888888888888',
    5,
    'Great attention to detail.',
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

-- Payment + review SMS logs
INSERT INTO payment_sms_logs (
  occurrence_id,
  body,
  tone,
  amount_cents,
  sent_at,
  created_at
)
VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    'Thanks for having us! Your total is $220.00. Pay here: https://pay.example.test/receipt/occ-1',
    'friendly',
    22000,
    now() - interval '20 hours',
    now() - interval '20 hours'
  );

INSERT INTO review_sms_logs (
  occurrence_id,
  body,
  tone,
  sent_at,
  created_at
)
VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    'Thanks again! If you can, please leave a review: https://review.example.test/alex',
    'friendly',
    now() - interval '18 hours',
    now() - interval '18 hours'
  );

-- Marketing email journeys + logs
INSERT INTO marketing_email_journeys (
  id,
  lead_id,
  status,
  current_step,
  next_send_at,
  started_at,
  updated_at
)
VALUES
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '22222222-2222-2222-2222-222222222222',
    'active',
    2,
    now() + interval '2 days',
    now() - interval '5 days',
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

INSERT INTO marketing_email_logs (
  journey_id,
  lead_id,
  step,
  attempt,
  template_id,
  subject,
  body,
  status,
  scheduled_for,
  sent_at,
  created_at
)
VALUES
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '22222222-2222-2222-2222-222222222222',
    1,
    1,
    (SELECT id FROM marketing_email_templates WHERE step = 1 AND variant = 1 LIMIT 1),
    'Quick follow-up',
    'Hi Jordan, just following up on your enquiry. Happy to help if you want details.',
    'sent',
    now() - interval '4 days',
    now() - interval '4 days',
    now() - interval '4 days'
  );

-- Marketing SMS journeys + logs
INSERT INTO marketing_sms_journeys (
  id,
  lead_id,
  status,
  current_step,
  next_send_at,
  started_at,
  completed_at,
  cancelled_at,
  locked_at,
  locked_by,
  last_error,
  updated_at
)
VALUES
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '22222222-2222-2222-2222-222222222222',
    'active',
    1,
    now() + interval '3 days',
    now() - interval '2 days',
    null,
    null,
    null,
    null,
    null,
    now() - interval '1 day'
  )
ON CONFLICT DO NOTHING;

INSERT INTO marketing_sms_logs (
  journey_id,
  lead_id,
  template_id,
  step,
  sent_at,
  status,
  error,
  message_id
)
VALUES
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM marketing_sms_templates WHERE step = 1 AND variant = 1 LIMIT 1),
    1,
    now() - interval '2 days',
    'sent',
    null,
    'sms_seed_001'
  );

-- Email reminders and receipts
INSERT INTO booking_occurrence_reminders (
  occurrence_id,
  reminder_type,
  email_to,
  payload
)
VALUES
  (
    '77777777-7777-7777-7777-777777777777',
    '24h',
    'alex@example.com',
    '{"type":"24h","occurrenceId":"77777777-7777-7777-7777-777777777777"}'::jsonb
  )
ON CONFLICT (occurrence_id, reminder_type) DO NOTHING;

INSERT INTO booking_occurrence_completion_emails (
  occurrence_id,
  email_to,
  payload
)
VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    'alex@example.com',
    '{"type":"completed","occurrenceId":"66666666-6666-6666-6666-666666666666"}'::jsonb
  )
ON CONFLICT (occurrence_id) DO NOTHING;

INSERT INTO booking_occurrence_receipt_emails (
  occurrence_id,
  email_to,
  payload
)
VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    'alex@example.com',
    '{"type":"receipt","occurrenceId":"66666666-6666-6666-6666-666666666666"}'::jsonb
  )
ON CONFLICT (occurrence_id) DO NOTHING;

-- Todos + daily summary
INSERT INTO todos (
  id,
  type,
  reference_id,
  reference_type,
  title,
  description,
  is_completed,
  due_date,
  auto_generated,
  roll_over,
  created_at,
  updated_at
)
VALUES
  (
    '12121212-1212-1212-1212-121212121212',
    'manual',
    null,
    null,
    'Call back Jordan',
    'Follow up on end-of-lease enquiry.',
    false,
    (now() + interval '1 day')::date,
    false,
    true,
    now() - interval '12 hours',
    now() - interval '12 hours'
  ),
  (
    '13131313-1313-1313-1313-131313131313',
    'unassigned_job',
    '77777777-7777-7777-7777-777777777777',
    'booking_occurrences',
    'Assign cleaner for next booking',
    'Upcoming booking needs confirmation.',
    false,
    (now() + interval '3 days')::date,
    true,
    true,
    now() - interval '6 hours',
    now() - interval '6 hours'
  )
ON CONFLICT DO NOTHING;

INSERT INTO daily_summary_logs (
  summary_date,
  timezone,
  sent_at,
  payload
)
VALUES
  (
    (now() - interval '1 day')::date,
    'Australia/Sydney',
    now() - interval '1 day' + interval '2 hours',
    '{"leads":2,"quotes":1,"bookings":1,"revenue":165.00}'::jsonb
  )
ON CONFLICT (summary_date) DO NOTHING;

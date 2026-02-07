-- Extra dummy data for UI testing (Jessie Smith scenario)
-- NOTE: Uses the default seeded org id. Update if you want a different org.

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
  summary,
  org_id
)
VALUES
  (
    '1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
    'msg_email_003',
    'inbound',
    'Fortnightly clean enquiry',
    'jessie.smith@example.com',
    'sales@company.test',
    now() - interval '4 days',
    'Hi, I am Jessie. Looking for a fortnightly clean for a 3 bed, 2 bath in Bondi.',
    'Jessie Smith requested a fortnightly clean in Bondi.',
    '00000000-0000-0000-0000-000000000001'
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
  internal_number,
  org_id
)
VALUES
  (
    '2f2f2f2f-2f2f-2f2f-2f2f-2f2f2f2f2f2f',
    'call_1002',
    'inbound',
    312,
    now() - interval '3 days',
    'Caller confirmed fortnightly booking and asked about eco-friendly products.',
    'Jessie confirmed booking details and product preference.',
    now() - interval '3 days',
    '+61400222333',
    '+61290001111',
    '00000000-0000-0000-0000-000000000001'
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
  internal_number,
  org_id
)
VALUES
  (
    '3f3f3f3f-3f3f-3f3f-3f3f-3f3f3f3f3f3f',
    'sms_2002',
    'outbound',
    now() - interval '2 days',
    'Thanks Jessie! Your quote and schedule are ready. Let me know if you want any changes.',
    'Quote follow-up SMS sent.',
    '+61400222333',
    '+61290001111',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- Lead
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
  created_at,
  org_id
)
VALUES
  (
    '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
    '1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
    'Jessie Smith',
    '+61400222333',
    'jessie.smith@example.com',
    'Bondi, prefers Friday mornings, eco-friendly supplies',
    now() - interval '4 days',
    'Job Won',
    now() - interval '3 days',
    now() - interval '2 days',
    'Thanks Jessie! Your quote and schedule are ready. Let me know if you want any changes.',
    now() - interval '4 days',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- Quote (base)
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
  created_at,
  org_id
)
VALUES
  (
    '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
    '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
    '1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
    'B2026-021',
    '45 Campbell Parade, Bondi NSW',
    -33.8915,
    151.2767,
    'Fortnightly maintenance clean',
    'standard',
    3,
    2,
    '["kitchen","bathroom","floors"]'::jsonb,
    '[{"name":"Balcony tidy","price":25}]'::jsonb,
    65.00,
    38.00,
    'hour',
    3.5,
    0.5,
    4.0,
    260.00,
    0.00,
    0.00,
    236.36,
    23.64,
    260.00,
    152.00,
    84.36,
    32.45,
    20.00,
    52.00,
    208.00,
    'Use side gate access.',
    'Jessie Smith',
    '+61400222333',
    'jessie.smith@example.com',
    'seed-quote-token-jessie',
    now() - interval '2 days',
    'Jessie Smith',
    'Jessie Smith',
    true,
    (now() - interval '2 days')::date,
    'invoice',
    null,
    'series_base',
    null,
    now() - interval '4 days',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- Cleaner
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
  transport_type,
  org_id
)
VALUES
  (
    '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
    'Morgan Patel',
    '+61400999111',
    'morgan.patel@example.com',
    'Bondi NSW',
    -33.8915,
    151.2767,
    'Morgan Patel',
    '062000',
    '87654321',
    '{"standard":50,"deep":60,"end_of_lease":70}'::jsonb,
    '{"Tue":{"Morning":true,"Afternoon":true},"Thu":{"Morning":true},"Fri":{"Morning":true,"Afternoon":true}}'::jsonb,
    true,
    'car',
    '00000000-0000-0000-0000-000000000001'
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
  updated_at,
  org_id
)
VALUES
  (
    '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f',
    '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
    '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
    'Fortnightly Clean - Jessie',
    'Australia/Sydney',
    now() + interval '5 days',
    240,
    'FREQ=WEEKLY;INTERVAL=2',
    (now() + interval '90 days')::date,
    'Call on arrival, side gate access.',
    'active',
    '45 Campbell Parade, Bondi NSW',
    -33.8915,
    151.2767,
    now() - interval '3 days',
    now() - interval '1 day',
    '00000000-0000-0000-0000-000000000001'
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
  updated_at,
  org_id
)
VALUES
  (
    '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
    '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f',
    now() - interval '7 days',
    now() - interval '7 days' + interval '4 hours',
    'completed',
    'Completed with balcony tidy.',
    '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
    now() - interval '8 days',
    'Assigned to Morgan.',
    '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
    'paid',
    'https://pay.example.test/receipt/occ-jessie-1',
    26000,
    'Paid via invoice.',
    now() - interval '6 days',
    now() - interval '8 days',
    now() - interval '7 days',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '8f8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f',
    '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f',
    now() + interval '7 days',
    now() + interval '7 days' + interval '4 hours',
    'scheduled',
    'Bring eco-friendly supplies.',
    '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
    now() - interval '1 day',
    'Confirmed with Morgan.',
    '5f5f5f5f-5f5f-5f5f-5f5f-5f5f5f5f5f5f',
    'invoice_sent',
    'https://pay.example.test/invoice/occ-jessie-2',
    26000,
    'Invoice sent.',
    null,
    now() - interval '2 days',
    now() - interval '1 day',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- Cleaner review (requires completed occurrence)
INSERT INTO cleaner_job_reviews (
  id,
  occurrence_id,
  cleaner_id,
  rating,
  notes,
  created_at,
  org_id
)
VALUES
  (
    'afafafaf-afaf-afaf-afaf-afafafafafaf',
    '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
    '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f',
    4,
    'Great communication and tidy finish.',
    now() - interval '6 days',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- Payment + review SMS logs
INSERT INTO payment_sms_logs (
  occurrence_id,
  body,
  tone,
  amount_cents,
  sent_at,
  created_at,
  org_id
)
VALUES
  (
    '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
    'Thanks Jessie! Your total is $260.00. Pay here: https://pay.example.test/receipt/occ-jessie-1',
    'friendly',
    26000,
    now() - interval '6 days',
    now() - interval '6 days',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

INSERT INTO review_sms_logs (
  occurrence_id,
  body,
  tone,
  sent_at,
  created_at,
  org_id
)
VALUES
  (
    '7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f',
    'Thanks again Jessie! If you have a moment, please leave a review: https://review.example.test/jessie',
    'friendly',
    now() - interval '5 days',
    now() - interval '5 days',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- Todo
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
  updated_at,
  org_id
)
VALUES
  (
    'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
    'manual',
    '4f4f4f4f-4f4f-4f4f-4f4f-4f4f4f4f4f4f',
    'extracted_leads',
    'Confirm access details for Jessie Smith',
    'Verify side gate code and parking instructions.',
    false,
    (now() + interval '2 days')::date,
    false,
    true,
    now() - interval '4 hours',
    now() - interval '4 hours',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

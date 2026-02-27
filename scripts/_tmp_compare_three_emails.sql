SELECT e.id, e.created_at, e.subject, LEFT(e.body,160) AS body_preview,
       l.id AS lead_id, l.created_at AS lead_created_at, l.name, l.email, l.phone_number
FROM dialpad_emails e
LEFT JOIN extracted_leads l ON l.email_id = e.id
WHERE e.id IN (
  'f8bed2b2-5b7d-4cd1-9cd1-a4d213c4bcf5',
  '904411c6-08f6-471b-b4e1-0acf9b25fc37',
  'b9a20cbd-f425-439e-8876-aae1f646755f'
)
ORDER BY e.created_at DESC;

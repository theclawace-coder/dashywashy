WITH recent_emails AS (
  SELECT id, created_at, subject
  FROM dialpad_emails
  WHERE created_at >= TIMESTAMPTZ '2026-02-26 13:00:00+00'
    AND subject ILIKE 'New message from%'
)
SELECT e.id AS email_id, e.created_at AS email_created_at, e.subject,
       l.id AS lead_id, l.created_at AS lead_created_at
FROM recent_emails e
LEFT JOIN extracted_leads l ON l.email_id = e.id
ORDER BY e.created_at DESC
LIMIT 50;

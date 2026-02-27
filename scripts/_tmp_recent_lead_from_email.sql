SELECT l.id, l.created_at, l.email_id, l.name,
       e.created_at AS email_created_at,
       e.subject
FROM extracted_leads l
LEFT JOIN dialpad_emails e ON e.id = l.email_id
WHERE l.created_at >= TIMESTAMPTZ '2026-02-26 13:00:00+00'
ORDER BY l.created_at DESC
LIMIT 20;

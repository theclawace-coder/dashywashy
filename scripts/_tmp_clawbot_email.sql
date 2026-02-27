SELECT id, created_at, org_id, message_id, subject, from_email, to_email, direction, LEFT(body, 280) AS body_preview
FROM dialpad_emails
WHERE id = 'b9a20cbd-f425-439e-8876-aae1f646755f';

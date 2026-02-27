SELECT id, created_at, org_id, LEFT(payload::text, 300) AS payload_preview
FROM webhook_logs
WHERE payload->>'_source' = 'outlook'
  AND created_at >= NOW() - interval '30 minutes'
ORDER BY created_at DESC
LIMIT 10;

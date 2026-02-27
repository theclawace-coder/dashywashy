SELECT id, created_at, org_id,
       CASE WHEN payload::text ILIKE '%outlook%' THEN true ELSE false END AS has_outlook,
       CASE WHEN payload::text ILIKE '%graph.microsoft.com%' THEN true ELSE false END AS has_graph,
       CASE WHEN payload::text ILIKE '%_source%' THEN true ELSE false END AS has_source_key,
       LEFT(payload::text, 220) AS preview
FROM webhook_logs
WHERE created_at >= TIMESTAMPTZ '2026-02-26 12:30:00+00'
  AND created_at <= TIMESTAMPTZ '2026-02-26 13:30:00+00'
ORDER BY created_at DESC
LIMIT 100;

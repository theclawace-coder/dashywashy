SELECT net.http_post(
  url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger',
  body := '{"event_type":"lead_status_change","org_id":"be073b8b-0de8-4e54-9d2f-9ad4d222501c","entity_type":"lead","entity_id":"65f47a0b-cb67-4bef-8032-f37a3d96e967","old_data":{"status":"Quote Sent"},"new_data":{"status":"Marketing Loop"}}'::text,
  headers := jsonb_build_object('Content-Type', 'application/json')
) AS request_id;
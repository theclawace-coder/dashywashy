DROP TRIGGER IF EXISTS debug_lead_status_trigger ON extracted_leads;
DROP FUNCTION IF EXISTS debug_lead_status_trigger();
DROP TABLE IF EXISTS workflow_debug_events;
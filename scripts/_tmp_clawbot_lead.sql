SELECT id, created_at, updated_at, org_id, email_id, name, email, phone_number, status, region_notes
FROM extracted_leads
WHERE email_id = 'b9a20cbd-f425-439e-8876-aae1f646755f'
ORDER BY created_at DESC;

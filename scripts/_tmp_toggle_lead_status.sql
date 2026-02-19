UPDATE extracted_leads
SET status = CASE WHEN status = 'Marketing Loop' THEN 'Quote Sent' ELSE 'Marketing Loop' END
WHERE id = '65f47a0b-cb67-4bef-8032-f37a3d96e967'
RETURNING id, status;
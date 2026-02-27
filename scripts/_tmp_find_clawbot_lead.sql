SELECT id, created_at, org_id, email_id, name, email, phone_number, status
FROM extracted_leads
WHERE (COALESCE(name,'') ILIKE '%clawbot%'
   OR COALESCE(name,'') ILIKE '%lewis%'
   OR COALESCE(email,'') ILIKE '%erfy@gmail.com%')
ORDER BY created_at DESC
LIMIT 10;

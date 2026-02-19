SELECT o.id AS org_id, o.name, COUNT(l.id) AS lead_count
FROM organizations o
JOIN extracted_leads l ON l.org_id = o.id
GROUP BY o.id, o.name
ORDER BY lead_count DESC
LIMIT 10;
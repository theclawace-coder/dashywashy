SELECT o.id AS org_id, o.name, COUNT(l.id) AS lead_count
FROM organizations o
LEFT JOIN extracted_leads l ON l.org_id = o.id
WHERE o.name = 'E2E Test Org'
GROUP BY o.id, o.name;
import { readFileSync } from 'fs';

// Read .env file
const envContent = readFileSync('.env', 'utf8');
const SUPABASE_ACCESS_TOKEN = envContent.match(/SUPABASE_ACCESS_TOKEN=(.+)/)?.[1];
const SUPABASE_URL = envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1];

if (!SUPABASE_ACCESS_TOKEN) {
  console.log('No SUPABASE_ACCESS_TOKEN found in .env');
  process.exit(1);
}

const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || 'jditayvwnlxktotfybvk';

const sql = `
-- Check which orgs have communication data
SELECT
  o.id as org_id,
  o.name as org_name,
  o.business_name,
  (SELECT COUNT(*) FROM dialpad_calls WHERE org_id = o.id) as calls,
  (SELECT COUNT(*) FROM dialpad_sms WHERE org_id = o.id) as sms,
  (SELECT COUNT(*) FROM dialpad_emails WHERE org_id = o.id) as emails
FROM organizations o
WHERE o.id IN (
  SELECT DISTINCT org_id FROM dialpad_calls
  UNION
  SELECT DISTINCT org_id FROM dialpad_sms
  UNION
  SELECT DISTINCT org_id FROM dialpad_emails
)
ORDER BY calls DESC, sms DESC, emails DESC;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));

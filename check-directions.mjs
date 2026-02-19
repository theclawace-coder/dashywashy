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
-- Check direction distribution in last 24h
SELECT
  'calls' as type,
  direction,
  COUNT(*) as count,
  array_agg(DISTINCT external_number) FILTER (WHERE external_number IS NOT NULL) as sample_numbers
FROM dialpad_calls
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY direction

UNION ALL

SELECT
  'sms' as type,
  direction,
  COUNT(*) as count,
  array_agg(DISTINCT external_number) FILTER (WHERE external_number IS NOT NULL) as sample_numbers
FROM dialpad_sms
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY direction

ORDER BY type, count DESC;
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

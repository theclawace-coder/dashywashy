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
-- Check if webhook data was inserted into the actual tables
SELECT
  'webhook_logs' as source,
  'calls' as type,
  COUNT(*) FILTER (WHERE (payload->>'call_id') IS NOT NULL) as count
FROM webhook_logs
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'webhook_logs' as source,
  'sms' as type,
  COUNT(*) FILTER (WHERE (payload->>'text') IS NOT NULL) as count
FROM webhook_logs
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'dialpad_calls' as source,
  'calls' as type,
  COUNT(*) as count
FROM dialpad_calls
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'dialpad_sms' as source,
  'sms' as type,
  COUNT(*) as count
FROM dialpad_sms
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at >= NOW() - INTERVAL '24 hours';
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

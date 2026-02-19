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
-- Check today's data in the actual tables
SELECT
  'calls' as type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM dialpad_calls
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at::date = CURRENT_DATE

UNION ALL

SELECT
  'sms' as type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM dialpad_sms
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at::date = CURRENT_DATE

UNION ALL

SELECT
  'emails' as type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM dialpad_emails
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at::date = CURRENT_DATE

UNION ALL

SELECT
  'webhook_logs' as type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM webhook_logs
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND created_at::date = CURRENT_DATE;
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

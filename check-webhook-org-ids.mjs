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
-- Check org_id distribution in recent webhook data
SELECT
  org_id,
  COUNT(*) FILTER (WHERE (payload->>'call_id') IS NOT NULL) as calls,
  COUNT(*) FILTER (WHERE (payload->>'text') IS NOT NULL) as sms_messages
FROM webhook_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY org_id
ORDER BY calls DESC, sms_messages DESC;
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
console.log('Webhook logs org_id distribution:');
console.log(JSON.stringify(data, null, 2));

// Now check the actual tables
const sql2 = `
-- Check org_id in actual communication tables
SELECT
  'dialpad_calls' as table_name,
  org_id,
  COUNT(*) as count
FROM dialpad_calls
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY org_id

UNION ALL

SELECT
  'dialpad_sms' as table_name,
  org_id,
  COUNT(*) as count
FROM dialpad_sms
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY org_id

ORDER BY table_name, count DESC;
`;

const response2 = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql2 })
});

const data2 = await response2.json();
console.log('\nCommunication tables org_id distribution:');
console.log(JSON.stringify(data2, null, 2));

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
-- Check all communication data regardless of org_id or date
SELECT
  'dialpad_calls' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE org_id IS NULL) as null_org_count,
  COUNT(*) FILTER (WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba') as your_org_count,
  MAX(created_at) as latest_record
FROM dialpad_calls

UNION ALL

SELECT
  'dialpad_sms' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE org_id IS NULL) as null_org_count,
  COUNT(*) FILTER (WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba') as your_org_count,
  MAX(created_at) as latest_record
FROM dialpad_sms

UNION ALL

SELECT
  'dialpad_emails' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE org_id IS NULL) as null_org_count,
  COUNT(*) FILTER (WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba') as your_org_count,
  MAX(created_at) as latest_record
FROM dialpad_emails;
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
console.log('Complete Database Overview:');
console.log(JSON.stringify(data, null, 2));

// Also check if there's data from today (user's timezone might be ahead)
const sql2 = `
SELECT
  'Recent calls (any org)' as type,
  COUNT(*) as count
FROM dialpad_calls
WHERE created_at >= NOW() - INTERVAL '6 hours'

UNION ALL

SELECT
  'Recent SMS (any org)' as type,
  COUNT(*) as count
FROM dialpad_sms
WHERE created_at >= NOW() - INTERVAL '6 hours'

UNION ALL

SELECT
  'Recent emails (any org)' as type,
  COUNT(*) as count
FROM dialpad_emails
WHERE created_at >= NOW() - INTERVAL '6 hours';
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
console.log('\nRecent Activity (last 6 hours):');
console.log(JSON.stringify(data2, null, 2));

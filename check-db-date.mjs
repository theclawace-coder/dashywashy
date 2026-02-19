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
-- Check database current date and timezone
SELECT
  CURRENT_DATE as current_date,
  CURRENT_TIMESTAMP as current_timestamp,
  NOW() as now,
  (SELECT MAX(created_at) FROM webhook_logs WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba') as latest_webhook,
  (SELECT COUNT(*) FROM webhook_logs WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba' AND created_at >= NOW() - INTERVAL '1 day') as webhooks_last_24h;
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

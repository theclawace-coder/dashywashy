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
-- Check what data is in the recent webhook payloads
SELECT
  created_at,
  (payload->>'state') as state,
  (payload->>'direction') as direction,
  CASE
    WHEN payload->>'call_id' IS NOT NULL THEN 'call'
    WHEN payload->>'text' IS NOT NULL OR payload->>'text_content' IS NOT NULL THEN 'sms'
    ELSE 'unknown'
  END as detected_type,
  (payload->>'call_id') as call_id,
  (payload->>'id') as id,
  (payload->>'text') as text_preview
FROM webhook_logs
WHERE org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
ORDER BY created_at DESC
LIMIT 20;
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

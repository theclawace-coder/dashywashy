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
-- Check recent Outlook integration updates
SELECT
  i.org_id,
  o.name as org_name,
  i.provider,
  i.enabled,
  (i.config->>'user_email') as user_email,
  LEFT((i.config->>'client_id'), 12) as client_id_prefix,
  LEFT((i.config->>'client_secret'), 12) as has_secret,
  i.updated_at,
  i.created_at
FROM organization_integrations i
JOIN organizations o ON o.id = i.org_id
WHERE i.provider = 'outlook'
ORDER BY i.updated_at DESC NULLS LAST;
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

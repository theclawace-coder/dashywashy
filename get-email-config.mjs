import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
const SUPABASE_ACCESS_TOKEN = envContent.match(/SUPABASE_ACCESS_TOKEN=(.+)/)?.[1];
const SUPABASE_URL = envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1];

if (!SUPABASE_ACCESS_TOKEN) {
  console.log('No SUPABASE_ACCESS_TOKEN found');
  process.exit(1);
}

const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];

const sql = `
SELECT
  config->>'user_email' as user_email,
  config->>'tenant_id' as tenant_id,
  enabled
FROM organization_integrations
WHERE provider = 'outlook'
  AND org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba';
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
console.log('Email Configuration:');
console.log(JSON.stringify(data, null, 2));

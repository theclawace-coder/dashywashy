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
SELECT
  (SELECT COUNT(*) FROM dialpad_calls) as total_calls,
  (SELECT COUNT(*) FROM dialpad_sms) as total_sms,
  (SELECT COUNT(*) FROM dialpad_emails) as total_emails,
  (SELECT COUNT(DISTINCT org_id) FROM dialpad_calls) as orgs_with_calls,
  (SELECT COUNT(DISTINCT org_id) FROM dialpad_sms) as orgs_with_sms,
  (SELECT COUNT(DISTINCT org_id) FROM dialpad_emails) as orgs_with_emails;
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

import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
const SUPABASE_ACCESS_TOKEN = envContent.match(/SUPABASE_ACCESS_TOKEN=(.+)/)?.[1];
const SUPABASE_URL = envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1];

if (!SUPABASE_ACCESS_TOKEN) {
  console.log('No SUPABASE_ACCESS_TOKEN found');
  process.exit(1);
}

const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];

console.log('🔍 Monitoring for new email webhooks...');
console.log('📧 Send a test email TO: sales@sydneypremiumcleaning.com.au');
console.log('⏱️  Checking every 3 seconds for 2 minutes...\n');

let lastWebhookId = null;
let checks = 0;
const maxChecks = 40; // 2 minutes

const checkForNewWebhooks = async () => {
  const sql = `
SELECT
  id,
  created_at,
  org_id,
  payload
FROM webhook_logs
ORDER BY created_at DESC
LIMIT 1;
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

  if (data && data[0]) {
    const webhook = data[0];

    if (lastWebhookId === null) {
      lastWebhookId = webhook.id;
      console.log(`Starting monitor. Latest webhook: ${webhook.created_at}`);
    } else if (webhook.id !== lastWebhookId) {
      console.log('\n✅ NEW WEBHOOK RECEIVED!');
      console.log('Webhook ID:', webhook.id);
      console.log('Created:', webhook.created_at);
      console.log('Org ID:', webhook.org_id);
      console.log('Payload preview:', JSON.stringify(webhook.payload).substring(0, 200) + '...');

      // Check if it was inserted into dialpad_emails
      const emailCheckSql = `
SELECT COUNT(*) as count
FROM dialpad_emails
WHERE created_at >= NOW() - INTERVAL '1 minute';
`;

      const emailCheck = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({ query: emailCheckSql })
      });

      const emailData = await emailCheck.json();
      console.log('\n📨 Emails inserted in last minute:', emailData[0]?.count || 0);

      process.exit(0);
    }
  }

  checks++;
  process.stdout.write(`\rChecked ${checks}/${maxChecks} times...`);

  if (checks >= maxChecks) {
    console.log('\n\n❌ No new webhooks received in 2 minutes.');
    console.log('This means Outlook webhooks are NOT configured or NOT working.');
    process.exit(1);
  }
};

// Check immediately
await checkForNewWebhooks();

// Then check every 3 seconds
const interval = setInterval(checkForNewWebhooks, 3000);

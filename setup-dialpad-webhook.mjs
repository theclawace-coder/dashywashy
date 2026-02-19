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

// Get Dialpad API key from database
const sql = `
SELECT config->>'api_key' as api_key
FROM organization_integrations
WHERE provider = 'dialpad'
  AND org_id = 'fb6e2a23-b091-4455-8e08-8bfb92b444ba'
  AND enabled = true
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
const dialpadApiKey = data[0]?.api_key;

if (!dialpadApiKey) {
  console.log('❌ No Dialpad API key found in database');
  process.exit(1);
}

console.log('✅ Found Dialpad API key:', dialpadApiKey.substring(0, 20) + '...');

// Webhook URL
const webhookUrl = `${SUPABASE_URL}/functions/v1/dialpad-webhook`;
console.log('📍 Webhook URL:', webhookUrl);

// List existing webhooks
console.log('\n📋 Listing existing webhooks...');
try {
  const listResponse = await fetch('https://dialpad.com/api/v2/webhooks', {
    headers: {
      'Authorization': `Bearer ${dialpadApiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    console.log('❌ Failed to list webhooks:', listResponse.status, errorText);
  } else {
    const webhooks = await listResponse.json();
    console.log('Existing webhooks:', JSON.stringify(webhooks, null, 2));
  }
} catch (err) {
  console.log('❌ Error listing webhooks:', err.message);
}

// Create new webhook subscription
console.log('\n🔧 Creating webhook subscription...');
const webhookConfig = {
  url: webhookUrl,
  events: [
    'call.ended',
    'call.completed',
    'sms.created',
    'sms.sent',
    'sms.received'
  ]
};

console.log('Webhook config:', JSON.stringify(webhookConfig, null, 2));

try {
  const createResponse = await fetch('https://dialpad.com/api/v2/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${dialpadApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(webhookConfig)
  });

  const responseText = await createResponse.text();

  if (!createResponse.ok) {
    console.log('❌ Failed to create webhook:', createResponse.status);
    console.log('Response:', responseText);
  } else {
    console.log('✅ Webhook created successfully!');
    console.log('Response:', responseText);
  }
} catch (err) {
  console.log('❌ Error creating webhook:', err.message);
}

console.log('\n✅ Done! Test by making a call or sending an SMS.');

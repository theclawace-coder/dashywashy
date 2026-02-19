import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
const SUPABASE_URL = envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1];
const SUPABASE_ANON_KEY = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('Missing Supabase credentials');
  process.exit(1);
}

console.log('Checking Outlook webhook subscription...\n');

// Call the setup-outlook-webhook function to list subscriptions
const response = await fetch(`${SUPABASE_URL}/functions/v1/setup-outlook-webhook`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({ action: 'list' })
});

const data = await response.json();

if (!response.ok) {
  console.log('❌ Error checking subscriptions:');
  console.log(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('✅ Response from setup-outlook-webhook:');
console.log(JSON.stringify(data, null, 2));

if (data.value && Array.isArray(data.value)) {
  console.log(`\n📊 Found ${data.value.length} active subscriptions`);

  if (data.value.length === 0) {
    console.log('\n❌ NO ACTIVE SUBSCRIPTIONS!');
    console.log('This is why email webhooks are not working.');
    console.log('\n💡 Solution: Go to Dashboard and click "Connect Email" button to create a subscription.');
  } else {
    data.value.forEach((sub, i) => {
      console.log(`\nSubscription ${i + 1}:`);
      console.log(`  ID: ${sub.id}`);
      console.log(`  Resource: ${sub.resource}`);
      console.log(`  Notification URL: ${sub.notificationUrl}`);
      console.log(`  Expires: ${sub.expirationDateTime}`);
    });
  }
}

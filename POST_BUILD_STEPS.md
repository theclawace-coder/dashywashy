# Post-Build Deployment Steps

## Overview

Your Dialpad Dashboard is now ready! Follow these steps to connect it to your Dialpad account.

## Step 1: Start the Dashboard (Development)

```bash
npm run dev
```

This will start the dashboard at `http://localhost:5173`

## Step 2: Deploy the Webhook Edge Function

The Edge Function has already been deployed to your Supabase project. You can verify it's running by checking:

```bash
supabase functions list
```

Or view it in your Supabase Dashboard → Edge Functions → `dialpad-webhook`

## Step 3: Get Your Webhook URL

Your webhook URL is:

```
https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook
```

## Step 4: Register Webhook with Dialpad

**Important:** Dialpad requires two steps:
1. Create the webhook (returns a webhook ID)
2. Create event subscriptions (using the webhook ID)

### Step 4a: Create the Webhook

Run this curl command (replace `YOUR_DIALPAD_API_KEY` with your actual API key):

```bash
curl -X POST https://dialpad.com/api/v2/webhooks \
  -H "Authorization: Bearer YOUR_DIALPAD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "hook_url": "https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook"
  }'
```

**PowerShell Alternative:**

```powershell
$headers = @{
    "Authorization" = "Bearer YOUR_DIALPAD_API_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    hook_url = "https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook"
} | ConvertTo-Json

$webhook = Invoke-RestMethod -Uri "https://dialpad.com/api/v2/webhooks" -Method Post -Headers $headers -Body $body
$webhookId = $webhook.id
Write-Host "Webhook ID: $webhookId"
```

**Save the webhook ID** from the response - you'll need it for the next step!

### Step 4b: Create Event Subscriptions

Dialpad requires separate subscriptions for each event type. Create subscriptions for:

**1. Call Events (for call.ended):**

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/call \
  -H "Authorization: Bearer YOUR_DIALPAD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": "YOUR_WEBHOOK_ID",
    "call_states": ["hangup"]
  }'
```

**PowerShell:**

```powershell
$body = @{
    webhook_id = $webhookId  # From Step 4a
    call_states = @("hangup")
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://dialpad.com/api/v2/subscriptions/call" -Method Post -Headers $headers -Body $body
```

**2. SMS Events (for inbound SMS):**

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/sms \
  -H "Authorization: Bearer YOUR_DIALPAD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": "YOUR_WEBHOOK_ID",
    "direction": "inbound"
  }'
```

**3. SMS Events (for outbound SMS):**

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/sms \
  -H "Authorization: Bearer YOUR_DIALPAD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": "YOUR_WEBHOOK_ID",
    "direction": "outbound"
  }'
```

**PowerShell (both SMS subscriptions):**

```powershell
# Inbound SMS
$bodyInbound = @{
    webhook_id = $webhookId
    direction = "inbound"
} | ConvertTo-Json
Invoke-RestMethod -Uri "https://dialpad.com/api/v2/subscriptions/sms" -Method Post -Headers $headers -Body $bodyInbound

# Outbound SMS
$bodyOutbound = @{
    webhook_id = $webhookId
    direction = "outbound"
} | ConvertTo-Json
Invoke-RestMethod -Uri "https://dialpad.com/api/v2/subscriptions/sms" -Method Post -Headers $headers -Body $bodyOutbound
```

**Reference:** [Dialpad API Documentation](https://developers.dialpad.com/reference/webhook_call_event_subscriptioncreate)

## Step 5: Verify Setup

1. **Make a test call** or **send a test SMS** through Dialpad
2. **Check Edge Function logs** to see if the webhook was received:
   ```bash
   supabase functions logs dialpad-webhook
   ```
3. **Dashboard should update in real-time** - no page refresh needed!

## Step 6: Deploy Dashboard to Production (Optional)

Build the production version:

```bash
npm run build
```

Deploy the `dist` folder to your preferred hosting:
- **Vercel**: `npx vercel --prod`
- **Netlify**: Drag and drop `dist` folder or use CLI
- **GitHub Pages**: Push `dist` to gh-pages branch

## Troubleshooting

### Webhook not receiving events

1. **Verify webhook registration** in Dialpad admin panel
2. **Check Edge Function logs**: `supabase functions logs dialpad-webhook`
3. **Test webhook manually**:
   ```bash
  curl -X POST https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook \
     -H "Content-Type: application/json" \
     -d '{"event_type": "call.ended", "call": {"call_id": "test-123", "direction": "outbound", "duration": 45}}'
   ```

### Dashboard not updating in real-time

1. **Check browser console** for WebSocket errors
2. **Verify Realtime is enabled** for `dialpad_calls` and `dialpad_sms` tables
3. **Check RLS policies** allow SELECT for anon role

### Data not showing

1. **Verify tables have data**:
   ```sql
   SELECT COUNT(*) FROM dialpad_calls WHERE created_at >= CURRENT_DATE;
   SELECT COUNT(*) FROM dialpad_sms WHERE created_at >= CURRENT_DATE;
   ```
2. **Check timezone** - dashboard filters by local browser time

## Database Schema Reference

### dialpad_calls
| Column     | Type        | Description                     |
|------------|-------------|---------------------------------|
| id         | uuid        | Primary key (auto-generated)    |
| call_id    | text        | Unique Dialpad call ID          |
| direction  | text        | 'inbound' or 'outbound'         |
| duration   | integer     | Call duration in seconds        |
| created_at | timestamptz | When the call ended             |

### dialpad_sms
| Column     | Type        | Description                     |
|------------|-------------|---------------------------------|
| id         | uuid        | Primary key (auto-generated)    |
| message_id | text        | Unique Dialpad message ID       |
| direction  | text        | 'inbound' or 'outbound'         |
| created_at | timestamptz | When the message was sent       |

## API Endpoints

### Webhook Endpoint
- **URL**: `https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook`
- **Method**: POST
- **Events**: `call.ended`, `sms.created`

## Support

- [Dialpad API Documentation](https://developers.dialpad.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Realtime Guide](https://supabase.com/docs/guides/realtime)


# Troubleshooting: Dialpad Webhook Not Receiving Calls

## Current Status ✅

- ✅ Webhook is registered with Dialpad
- ✅ Edge Function is deployed and working
- ✅ Database tables are set up correctly
- ✅ Webhook endpoint responds to test requests
- ✅ Enhanced logging is enabled in Edge Function

## The Problem

The webhook was registered but **event subscriptions were not created**. Dialpad requires two separate steps:
1. ✅ Create the webhook (returns a webhook ID)
2. ❌ Create event subscriptions (using the webhook ID) - **This was missing!**

**UPDATE:** Event subscriptions have now been created! The webhook should now receive events.

## ✅ SOLUTION: Event Subscriptions Created

**The issue has been resolved!** Event subscriptions have been created:

- ✅ **Call Subscription** (ID: 5362935763574784) - Subscribed to "hangup" state
- ✅ **SMS Inbound Subscription** (ID: 6281557327486976) - Enabled
- ✅ **SMS Outbound Subscription** (ID: 5078755578224640) - Enabled

All subscriptions are **enabled** and pointing to your webhook URL.

**Next Step:** Make a test call or send a test SMS through Dialpad - the dashboard should update automatically!

---

## Understanding Dialpad's Two-Step Process

Dialpad requires **two separate API calls**:

1. **Create Webhook** (`POST /api/v2/webhooks`) - Returns a webhook ID
2. **Create Subscriptions** - Use the webhook ID to subscribe to specific events:
   - Call events: `POST /api/v2/subscriptions/call` (requires `call_states` like `["hangup"]`)
   - SMS events: `POST /api/v2/subscriptions/sms` (requires `direction`: `"inbound"` or `"outbound"`)

**Reference:** [Dialpad API Documentation](https://developers.dialpad.com/reference/webhook_call_event_subscriptioncreate)

---

## Most Likely Causes (For Future Reference)

### 1. Missing Event Subscriptions ⚠️

**This was the issue!** Dialpad requires separate subscriptions for each event type, not just webhook registration.

**Solution:**
1. Log into your Dialpad account
2. Go to **Settings** → **Integrations** → **Webhooks** (or **Admin** → **Integrations**)
3. Find your webhook: `https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook`
4. **Enable/Select these events:**
   - `call.ended` (or "Call Ended")
   - `sms.created` (or "SMS Created")
5. Save the configuration

### 2. Webhook Needs to be Verified/Activated

Some Dialpad accounts require webhook verification before events are sent.

**Check:**
- Look for a "Verify" or "Test" button next to your webhook
- Dialpad may have sent a verification request that needs to be acknowledged

### 3. Account Permissions

Your Dialpad API key might not have permissions to receive webhook events.

**Solution:**
- Verify your API key has "Webhook" or "Integration" permissions
- Check if your Dialpad account tier supports webhooks

## How to Verify Webhook is Working

### Step 1: Check Edge Function Logs

The Edge Function now has enhanced logging. Check for incoming requests:

```bash
supabase functions logs dialpad-webhook --tail
```

Or view in Supabase Dashboard → Edge Functions → dialpad-webhook → Logs

**What to look for:**
- Any POST requests from Dialpad (not your test requests)
- The full payload structure if requests are coming in
- Error messages if payload format is unexpected

### Step 2: Make a Test Call

1. Make a real call through Dialpad (call your own number or a test number)
2. Let the call complete (answer and hang up)
3. Immediately check the Edge Function logs
4. Check the dashboard - it should update automatically

### Step 3: Check Database

```sql
-- Check if any calls were recorded
SELECT * FROM dialpad_calls ORDER BY created_at DESC LIMIT 10;

-- Check if any SMS were recorded  
SELECT * FROM dialpad_sms ORDER BY created_at DESC LIMIT 10;
```

## Enhanced Logging

The Edge Function now logs:
- ✅ Full request body (raw JSON)
- ✅ Request headers
- ✅ Parsed payload structure
- ✅ All payload keys
- ✅ Detected event type
- ✅ Processing details for calls/SMS
- ✅ Error details if something fails

**If Dialpad IS sending webhooks**, you'll see detailed logs showing exactly what format they're using, which will help us adjust the code if needed.

## Testing the Webhook Manually

You can test the webhook endpoint directly:

```powershell
$body = @{
    event_type = "call.ended"
    call = @{
        call_id = "test-manual-123"
        direction = "outbound"
        duration = 45
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook" `
    -Method Post `
    -Headers @{"Content-Type" = "application/json"} `
    -Body $body
```

This should return: `{"success": true, "event": "call.ended", "call_id": "test-manual-123"}`

## Next Steps

1. **Check Dialpad Admin Panel** - Most important step!
   - Settings → Integrations → Webhooks
   - Enable `call.ended` and `sms.created` events

2. **Make a test call** through Dialpad

3. **Monitor Edge Function logs** in real-time:
   ```bash
   supabase functions logs dialpad-webhook --tail
   ```

4. **If logs show incoming requests** but they're in a different format, share the log output and we can update the Edge Function to handle Dialpad's actual payload format.

5. **If no requests appear in logs**, the issue is with Dialpad configuration, not our code.

## Common Dialpad Webhook Payload Formats

Based on Dialpad API documentation, webhooks might use these formats:

### Call Ended Event (Possible Formats):
```json
{
  "event_type": "call.ended",
  "call": {
    "id": "12345",
    "call_id": "12345",
    "direction": "outbound",
    "duration": 60
  }
}
```

OR

```json
{
  "type": "call.ended",
  "data": {
    "call": {
      "id": "12345",
      "direction": "outbound",
      "total_duration": 60
    }
  }
}
```

The enhanced logging will show us exactly what Dialpad sends!

## Support Resources

- [Dialpad Developer Documentation](https://developers.dialpad.com/)
- [Dialpad API Reference](https://developers.dialpad.com/reference)
- [Dialpad Developer Community](https://developers.dialpad.com/discuss)

## Still Not Working?

If you've checked the admin panel and made test calls but still no webhooks:

1. **Share the Edge Function logs** - Even if empty, this confirms Dialpad isn't sending
2. **Check Dialpad account settings** - Some accounts require webhook approval
3. **Contact Dialpad Support** - They can verify webhook configuration on their end


# Outlook Email Integration Setup

This guide will help you connect your Outlook email to track sent and received emails in your dashboard.

## Prerequisites

- Microsoft 365 account (Outlook/Office 365)
- Azure AD admin access (or ability to register an app)

## Step 1: Register Azure AD Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: `Dialpad Dashboard Email Sync`
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Leave blank for now
5. Click **Register**
6. **Save these values**:
   - **Application (client) ID** → This is your `MICROSOFT_CLIENT_ID`
   - **Directory (tenant) ID** → This is your `MICROSOFT_TENANT_ID`

## Step 2: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add description: `Dashboard Email Sync`
4. Choose expiration (recommend 24 months)
5. Click **Add**
6. **Copy the secret value immediately** → This is your `MICROSOFT_CLIENT_SECRET`
   - ⚠️ **You won't be able to see it again!**

## Step 3: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Application permissions** (not Delegated)
5. Add these permissions:
   - `Mail.Read` - Read all user mailboxes
   - `Mail.ReadWrite` - Read and write mail in all mailboxes
6. Click **Add permissions**
7. Click **Grant admin consent** (requires admin approval)
   - Confirm the consent

## Step 4: Configure Supabase Edge Function

You need to set environment variables for the Edge Function:

### Option A: Using Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** → **outlook-email-sync**
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

```
MICROSOFT_TENANT_ID=your-tenant-id-here
MICROSOFT_CLIENT_ID=your-client-id-here
MICROSOFT_CLIENT_SECRET=your-client-secret-here
OUTLOOK_USER_EMAIL=your-email@domain.com
```

### Option B: Using Supabase CLI

```bash
supabase secrets set MICROSOFT_TENANT_ID=your-tenant-id-here
supabase secrets set MICROSOFT_CLIENT_ID=your-client-id-here
supabase secrets set MICROSOFT_CLIENT_SECRET=your-client-secret-here
supabase secrets set OUTLOOK_USER_EMAIL=your-email@domain.com
```

## Step 5: Test the Integration

1. **Manual Sync**: Click the "Sync Emails" button in your dashboard
2. **Check Logs**: 
   ```bash
   supabase functions logs outlook-email-sync
   ```
3. **Verify Data**: Check if emails appear in your dashboard

## Step 6: Set Up Real-Time Email Notifications (Recommended)

For **instant email notifications** using Microsoft Graph webhooks:

### Set Up Webhook Subscription

1. **Call the setup endpoint** to create a subscription:

```bash
curl -X POST https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook \
  -H "Content-Type: application/json" \
  -d '{"action": "create"}'
```

2. **List existing subscriptions**:

```bash
curl https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook
```

3. **Renew subscription** (subscriptions expire after ~3 days):

```bash
curl -X POST https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook \
  -H "Content-Type: application/json" \
  -d '{"action": "renew", "subscription_id": "your-subscription-id"}'
```

4. **Delete subscription**:

```bash
curl -X POST https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook \
  -H "Content-Type: application/json" \
  -d '{"action": "delete", "subscription_id": "your-subscription-id"}'
```

### Azure AD Permissions for Webhooks

You need additional permissions for webhooks to work:

1. Go to your Azure AD app registration
2. Add these **Application permissions**:
   - `Mail.Read` - Read all user mailboxes
   - `Mail.ReadBasic.All` - Read basic mail properties
3. Grant admin consent

### Webhook Endpoint

The webhook receives notifications at:
```
https://jditayvwnlxktotfybvk.supabase.co/functions/v1/outlook-webhook
```

### Auto-Renewal

Set up a cron job to auto-renew the subscription before it expires. The subscription expires after ~3 days, so renewing daily ensures continuous operation.

#### Option 1: Using Supabase pg_cron (if enabled)

If your Supabase project has `pg_cron` extension enabled:

```sql
-- First, ensure the pg_net extension is enabled (required for HTTP requests)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enable pg_cron extension (requires Supabase admin access)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to renew webhook subscription daily
-- Safe to call daily: the setup function deduplicates and renews the existing subscription
SELECT cron.schedule(
  'renew-outlook-webhook',
  '0 0 * * *', -- Daily at midnight UTC
  $$
  SELECT net.http_post(
    url:='https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{"action": "create"}'::jsonb,
    timeout_milliseconds:=30000
  ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'renew-outlook-webhook';

-- To unschedule the cron job later (if needed):
-- SELECT cron.unschedule('renew-outlook-webhook');
```

#### Option 2: Using External Cron Service (Recommended)

If `pg_cron` is not available, use an external cron service:

**Using cron-job.org:**
1. Go to [cron-job.org](https://cron-job.org)
2. Create a new cron job
3. Set URL: `https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook`
4. Method: `POST`
5. Headers: `Content-Type: application/json`
6. Body: `{"action": "create"}`
7. Schedule: Daily at midnight UTC (`0 0 * * *`)

**Using GitHub Actions (if you have a repo):**
Create `.github/workflows/renew-webhook.yml`:
```yaml
name: Renew Outlook Webhook
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  renew:
    runs-on: ubuntu-latest
    steps:
      - name: Renew webhook subscription
        run: |
          curl -X POST https://jditayvwnlxktotfybvk.supabase.co/functions/v1/setup-outlook-webhook \
            -H "Content-Type: application/json" \
            -d '{"action": "create"}'
```

**Note**: The renewal uses `"action": "create"`. The setup function is idempotent and will renew the existing Outlook subscription while removing duplicates if any exist.

## Step 7: Set Up Manual Sync (Backup/Alternative)

As a backup or alternative to webhooks, you can set up automatic email syncing using a cron job.
If you enable both webhook notifications and frequent syncs, make sure your sync function deduplicates by `message_id`
to avoid repeated inserts for the same email.

### Using Supabase Cron Jobs

Create a cron job to sync emails every hour:

```sql
-- Create a cron job to sync emails every hour
SELECT cron.schedule(
  'sync-outlook-emails',
  '0 * * * *', -- Every hour
  $$
  SELECT net.http_post(
    url:='https://jditayvwnlxktotfybvk.supabase.co/functions/v1/outlook-email-sync',
    headers:='{"Content-Type": "application/json"}'::jsonb
  ) AS request_id;
  $$
);
```

### Using External Cron Service

Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com) to call:

```
POST https://jditayvwnlxktotfybvk.supabase.co/functions/v1/outlook-email-sync
```

Set it to run every hour or as needed.

## Troubleshooting

### Error: "Insufficient privileges"
- Make sure you granted admin consent for API permissions
- Verify the app has `Mail.Read` and `Mail.ReadWrite` permissions

### Error: "Invalid client secret"
- Check that you copied the secret value correctly
- Secrets expire - create a new one if needed

### No emails showing up
- Check Edge Function logs for errors
- Verify `OUTLOOK_USER_EMAIL` matches your actual email address
- Ensure emails exist in the last 24 hours (function fetches last 24h by default)

### Authentication errors
- Verify tenant ID, client ID, and client secret are correct
- Check that admin consent was granted
- Ensure the app registration is active

## Security Notes

- ⚠️ **Never commit secrets to version control**
- Store secrets securely in Supabase environment variables
- Rotate client secrets regularly
- Use the minimum required permissions

## API Reference

- [Microsoft Graph Mail API](https://docs.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)

## Support

If you encounter issues:
1. Check Edge Function logs
2. Verify Azure AD app configuration
3. Test API permissions in Graph Explorer: https://developer.microsoft.com/en-us/graph/graph-explorer



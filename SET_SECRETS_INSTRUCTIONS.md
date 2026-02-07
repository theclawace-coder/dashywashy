# Setting Supabase Edge Function Secrets

## Quick Method: Supabase Dashboard (Recommended)

### For Outlook Email Sync:

1. **Go to Edge Function Settings:**
   - Direct link: https://supabase.com/dashboard/project/jditayvwnlxktotfybvk/functions/outlook-email-sync/settings
   - Or navigate: Dashboard → Edge Functions → outlook-email-sync → Settings → Secrets

2. **Add these 4 secrets (use your own values):**
   ```
   MICROSOFT_TENANT_ID = <your-microsoft-tenant-id>
   MICROSOFT_CLIENT_ID = <your-microsoft-client-id>
   MICROSOFT_CLIENT_SECRET = <your-microsoft-client-secret>
   OUTLOOK_USER_EMAIL = <your-outlook-user-email>
   ```

3. **Click Save/Apply**

---

### For Transcript & AI Summary (get-transcript-summary):

1. **Go to Supabase Project Settings:**
   - Direct link: https://supabase.com/dashboard/project/jditayvwnlxktotfybvk/settings/functions
   - Or navigate: Dashboard → Settings → Edge Functions → Secrets

2. **Add these 2 secrets (project-wide, so all functions can use them):**
   ```
   DIALPAD_API_KEY = <your-dialpad-api-key-from-dialpad-dashboard>
   OPENAI_API_KEY = <your-openai-api-key>
   ```

3. **Click Save**

**Note:** You need to get your DIALPAD_API_KEY from:
- Go to: https://dialpad.com/app → Admin Settings → Integrations → API Keys
- Create a new API key with "Transcripts" permission enabled

4. **Test the function:**
   - Click on any call in the Communications Log
   - Click "Get AI Summary" to fetch the transcript and generate a summary

---

## Alternative: Using PowerShell Script with API

If you prefer to use the API:

1. **Get your Supabase Access Token:**
   - Go to: https://supabase.com/dashboard/account/tokens
   - Create a new token or copy existing one

2. **Run the script:**
   ```powershell
   .\set-secrets-api.ps1 -AccessToken "your-access-token-here"
   ```

## Alternative: Using Supabase CLI

1. **Install Supabase CLI:**
   ```powershell
   # Using Scoop (Windows)
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   
   # Or using npx (no install needed)
   npx supabase --version
   ```

2. **Login:**
   ```powershell
   npx supabase login
   ```

3. **Link project:**
   ```powershell
   npx supabase link --project-ref jditayvwnlxktotfybvk
   ```

4. **Set secrets (replace placeholders with your values):**
   ```powershell
   npx supabase secrets set MICROSOFT_TENANT_ID=<your-microsoft-tenant-id>
   npx supabase secrets set MICROSOFT_CLIENT_ID=<your-microsoft-client-id>
   npx supabase secrets set MICROSOFT_CLIENT_SECRET=<your-microsoft-client-secret>
   npx supabase secrets set OUTLOOK_USER_EMAIL=<your-outlook-user-email>
   ```

## Verify Secrets Are Set

After setting secrets, test the function:

1. **Click "Sync Emails" button** in your dashboard
2. **Check logs:**
   - Dashboard → Edge Functions → outlook-email-sync → Logs
   - Or: `npx supabase functions logs outlook-email-sync`

## Troubleshooting

- **"Access token not provided"**: Make sure you're logged in or using the dashboard
- **"Function not found"**: Verify the function name is `outlook-email-sync`
- **"Permission denied"**: Ensure you have admin access to the project


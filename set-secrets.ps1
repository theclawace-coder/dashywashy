# Set Supabase Edge Function Secrets
# These will be used by the outlook-email-sync function

$supabaseUrl = "https://jditayvwnlxktotfybvk.supabase.co"
$projectRef = "jditayvwnlxktotfybvk"

# You'll need your Supabase access token or service role key
# Get it from: Supabase Dashboard → Settings → API → service_role key

Write-Host "Setting Supabase Edge Function Secrets..." -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: You need to set these in Supabase Dashboard:" -ForegroundColor Yellow
Write-Host "1. Go to: https://supabase.com/dashboard/project/$projectRef/settings/functions" -ForegroundColor White
Write-Host "2. Or use Supabase Dashboard → Edge Functions → outlook-email-sync → Settings → Secrets" -ForegroundColor White
Write-Host ""
Write-Host "Secrets to set:" -ForegroundColor Green
Write-Host ""
Write-Host "MICROSOFT_TENANT_ID=<your-microsoft-tenant-id>" -ForegroundColor Cyan
Write-Host "MICROSOFT_CLIENT_ID=<your-microsoft-client-id>" -ForegroundColor Cyan
Write-Host "MICROSOFT_CLIENT_SECRET=<your-microsoft-client-secret>" -ForegroundColor Cyan
Write-Host "OUTLOOK_USER_EMAIL=<your-outlook-user-email>" -ForegroundColor Cyan
Write-Host ""

# Alternative: If you have Supabase CLI installed, uncomment these:
# supabase secrets set MICROSOFT_TENANT_ID=<your-microsoft-tenant-id>
# supabase secrets set MICROSOFT_CLIENT_ID=<your-microsoft-client-id>
# supabase secrets set MICROSOFT_CLIENT_SECRET=<your-microsoft-secret>
# supabase secrets set OUTLOOK_USER_EMAIL=<your-outlook-user-email>

Write-Host "After setting secrets, test the sync:" -ForegroundColor Yellow
Write-Host "Click 'Sync Emails' button in your dashboard or call:" -ForegroundColor White
Write-Host "POST https://$supabaseUrl/functions/v1/outlook-email-sync" -ForegroundColor Gray



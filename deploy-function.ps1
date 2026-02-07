# Deploy edge functions with access token from .env
$envContent = Get-Content .env -Raw
if ($envContent -match 'SUPABASE_ACCESS_TOKEN=(.+)') {
    $env:SUPABASE_ACCESS_TOKEN = $Matches[1].Trim()
}

# Deploy AI assistant (includes _shared code automatically)
# Using --legacy-bundle to avoid Docker requirement
npx supabase functions deploy ai-assistant --project-ref jditayvwnlxktotfybvk --legacy-bundle

# Also deploy quote-email since we updated org-resolver
npx supabase functions deploy quote-email --project-ref jditayvwnlxktotfybvk --legacy-bundle

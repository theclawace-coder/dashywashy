# Set Supabase Edge Function Secrets via Management API
# Requires: Supabase Access Token (get from https://supabase.com/dashboard/account/tokens)

param(
    [Parameter(Mandatory=$true)]
    [string]$AccessToken
)

$projectRef = "jditayvwnlxktotfybvk"
$functionName = "outlook-email-sync"

$secrets = @{
    "MICROSOFT_TENANT_ID" = "<your-microsoft-tenant-id>"
    "MICROSOFT_CLIENT_ID" = "<your-microsoft-client-id>"
    "MICROSOFT_CLIENT_SECRET" = "<your-microsoft-client-secret>"
    "OUTLOOK_USER_EMAIL" = "<your-outlook-user-email>"
}

$headers = @{
    "Authorization" = "Bearer $AccessToken"
    "Content-Type" = "application/json"
}

Write-Host "Setting secrets for function: $functionName" -ForegroundColor Cyan
Write-Host ""

foreach ($key in $secrets.Keys) {
    $value = $secrets[$key]
    $body = @{
        name = $key
        value = $value
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/functions/$functionName/secrets" `
            -Method Post `
            -Headers $headers `
            -Body $body
        
        Write-Host "✓ Set $key" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to set $key" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        
        # Try PUT if POST fails (update existing)
        try {
            $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/functions/$functionName/secrets/$key" `
                -Method Put `
                -Headers $headers `
                -Body $body
            
            Write-Host "  ✓ Updated $key (was already set)" -ForegroundColor Yellow
        } catch {
            Write-Host "  ✗ Update also failed" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done! Test the sync by clicking 'Sync Emails' in your dashboard." -ForegroundColor Green



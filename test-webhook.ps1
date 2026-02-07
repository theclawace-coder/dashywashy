# Dialpad Webhook Diagnostic Script

$apiKey = "wG4YnBdLHf7h6x3Vb5MSux6ugrYHEyvZ4PeQextR6aFDrusdzMBwsuRE7XKZ7AFdd3mtZMJ4JxC37gvCUp2N33JnXRBKFYBZANDf"
$webhookUrl = "https://jditayvwnlxktotfybvk.supabase.co/functions/v1/dialpad-webhook"
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

Write-Host "=== Dialpad Webhook Diagnostics ===" -ForegroundColor Cyan
Write-Host ""

# 1. List all webhooks
Write-Host "1. Checking registered webhooks..." -ForegroundColor Yellow
try {
    $webhooks = Invoke-RestMethod -Uri "https://dialpad.com/api/v2/webhooks" -Method Get -Headers $headers
    Write-Host "   Found $($webhooks.items.Count) webhook(s)" -ForegroundColor Green
    foreach ($webhook in $webhooks.items) {
        Write-Host "   - ID: $($webhook.id), URL: $($webhook.hook_url)" -ForegroundColor White
        if ($webhook.hook_url -eq $webhookUrl) {
            Write-Host "     ✓ This is your webhook!" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# 2. Test webhook endpoint
Write-Host "2. Testing webhook endpoint..." -ForegroundColor Yellow
$testPayload = @{
    event_type = "call.ended"
    call = @{
        call_id = "test-diagnostic-$(Get-Date -Format 'yyyyMMddHHmmss')"
        direction = "outbound"
        duration = 60
    }
} | ConvertTo-Json

try {
    $testResponse = Invoke-RestMethod -Uri $webhookUrl -Method Post -Headers @{"Content-Type" = "application/json"} -Body $testPayload
    Write-Host "   ✓ Webhook endpoint is accessible" -ForegroundColor Green
    Write-Host "   Response: $($testResponse | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Webhook endpoint error: $_" -ForegroundColor Red
}

Write-Host ""

# 3. Check recent calls (if Dialpad API supports it)
Write-Host "3. Checking for recent call activity..." -ForegroundColor Yellow
Write-Host "   (Make a test call through Dialpad and check if webhook receives it)" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Make a test call through Dialpad" -ForegroundColor White
Write-Host "2. Check Supabase Edge Function logs:" -ForegroundColor White
Write-Host "   supabase functions logs dialpad-webhook" -ForegroundColor Gray
Write-Host "3. Check if events are configured in Dialpad Admin Panel" -ForegroundColor White
Write-Host "   (Settings > Integrations > Webhooks)" -ForegroundColor Gray







































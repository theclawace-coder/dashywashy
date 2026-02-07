# View Email Logs - Simple Text Format
# This script displays recent emails in a readable text format

$supabaseUrl = "https://jditayvwnlxktotfybvk.supabase.co"
$supabaseKey = Read-Host "Enter your Supabase anon key (or press Enter to use environment variable)"

if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
    $supabaseKey = $env:SUPABASE_ANON_KEY
}

if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
    Write-Host "Error: Supabase key not provided" -ForegroundColor Red
    exit 1
}

$limit = Read-Host "How many emails to view? (default: 10)"
if ([string]::IsNullOrWhiteSpace($limit)) {
    $limit = 10
}

Write-Host "`nFetching emails..." -ForegroundColor Yellow

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json"
}

$url = "$supabaseUrl/rest/v1/dialpad_emails?order=created_at.desc&limit=$limit&select=id,message_id,subject,from_email,to_email,direction,created_at,body"

try {
    $emails = Invoke-RestMethod -Uri $url -Method GET -Headers $headers
} catch {
    Write-Host "Error fetching emails: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n" + ("=" * 80) -ForegroundColor Cyan
Write-Host "EMAIL LOGS - Showing $($emails.Count) most recent emails" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Cyan

foreach ($email in $emails) {
    $createdAt = [DateTime]::Parse($email.created_at).ToString("yyyy-MM-dd HH:mm:ss UTC")
    $direction = if ($email.direction -eq "inbound") { "INBOUND ↓" } else { "OUTBOUND ↑" }
    $directionColor = if ($email.direction -eq "inbound") { "Green" } else { "Yellow" }
    
    # Strip HTML tags for text preview
    $bodyText = $email.body -replace '<[^>]+>', ' ' -replace '\s+', ' '
    $bodyPreview = if ($bodyText.Length -gt 200) { $bodyText.Substring(0, 200) + "..." } else { $bodyText }
    
    Write-Host "`n" + ("-" * 80) -ForegroundColor DarkGray
    Write-Host "SUBJECT: " -NoNewline -ForegroundColor White
    Write-Host $email.subject -ForegroundColor Cyan
    Write-Host "DIRECTION: " -NoNewline -ForegroundColor White
    Write-Host $direction -ForegroundColor $directionColor
    Write-Host "FROM:     " -NoNewline -ForegroundColor White
    Write-Host $email.from_email -ForegroundColor Gray
    Write-Host "TO:       " -NoNewline -ForegroundColor White
    Write-Host $email.to_email -ForegroundColor Gray
    Write-Host "TIME:     " -NoNewline -ForegroundColor White
    Write-Host $createdAt -ForegroundColor Gray
    Write-Host "ID:       " -NoNewline -ForegroundColor White
    Write-Host $email.id -ForegroundColor DarkGray
    Write-Host "`nBODY PREVIEW:" -ForegroundColor White
    Write-Host $bodyPreview -ForegroundColor DarkGray
    Write-Host ("-" * 80) -ForegroundColor DarkGray
}

Write-Host "`n" + ("=" * 80) -ForegroundColor Cyan
Write-Host "End of email logs" -ForegroundColor Cyan
Write-Host ("=" * 80) + "`n" -ForegroundColor Cyan



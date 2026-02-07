# Export Email Logs Script
# This script exports emails from the database to a readable log file format

$supabaseUrl = "https://jditayvwnlxktotfybvk.supabase.co"
$supabaseKey = Read-Host "Enter your Supabase anon key (or press Enter to use environment variable)"

if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
    $supabaseKey = $env:SUPABASE_ANON_KEY
}

if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
    Write-Host "Error: Supabase key not provided" -ForegroundColor Red
    exit 1
}

$limit = Read-Host "How many emails to export? (default: 50)"
if ([string]::IsNullOrWhiteSpace($limit)) {
    $limit = 50
}

Write-Host "Fetching emails from database..." -ForegroundColor Yellow

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json"
}

$url = "$supabaseUrl/rest/v1/dialpad_emails?order=created_at.desc&limit=$limit&select=id,message_id,subject,from_email,to_email,direction,created_at,body"

try {
    $response = Invoke-RestMethod -Uri $url -Method GET -Headers $headers
} catch {
    Write-Host "Error fetching emails: $_" -ForegroundColor Red
    exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = "email-logs_$timestamp.html"

Write-Host "Exporting $($response.Count) emails to $logFile..." -ForegroundColor Yellow

# Create HTML log file
$html = @"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Email Logs - $timestamp</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a1a;
            color: #e0e0e0;
        }
        h1 {
            color: #4a9eff;
            border-bottom: 2px solid #4a9eff;
            padding-bottom: 10px;
        }
        .email-entry {
            background-color: #2a2a2a;
            border: 1px solid #3a3a3a;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .email-header {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #3a3a3a;
        }
        .email-field {
            margin-bottom: 8px;
        }
        .email-label {
            font-weight: bold;
            color: #4a9eff;
            display: inline-block;
            min-width: 120px;
        }
        .email-value {
            color: #e0e0e0;
        }
        .direction-inbound {
            color: #4caf50;
            font-weight: bold;
        }
        .direction-outbound {
            color: #ff9800;
            font-weight: bold;
        }
        .email-body {
            background-color: #1a1a1a;
            border: 1px solid #3a3a3a;
            border-radius: 4px;
            padding: 15px;
            margin-top: 15px;
            max-height: 400px;
            overflow-y: auto;
        }
        .email-body-content {
            color: #e0e0e0;
        }
        .timestamp {
            color: #888;
            font-size: 0.9em;
        }
        .subject {
            font-size: 1.2em;
            font-weight: bold;
            color: #fff;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <h1>Email Logs - Exported on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</h1>
    <p>Total emails: $($response.Count)</p>
"@

foreach ($email in $response) {
    $directionClass = if ($email.direction -eq "inbound") { "direction-inbound" } else { "direction-outbound" }
    $directionIcon = if ($email.direction -eq "inbound") { "↓" } else { "↑" }
    
    $createdAt = [DateTime]::Parse($email.created_at).ToString("yyyy-MM-dd HH:mm:ss UTC")
    
    $html += @"
    <div class="email-entry">
        <div class="subject">$($email.subject -replace '<[^>]+>', '')</div>
        <div class="email-header">
            <div>
                <div class="email-field">
                    <span class="email-label">Direction:</span>
                    <span class="email-value $directionClass">$directionIcon $($email.direction)</span>
                </div>
                <div class="email-field">
                    <span class="email-label">From:</span>
                    <span class="email-value">$($email.from_email)</span>
                </div>
                <div class="email-field">
                    <span class="email-label">To:</span>
                    <span class="email-value">$($email.to_email)</span>
                </div>
            </div>
            <div>
                <div class="email-field">
                    <span class="email-label">Message ID:</span>
                    <span class="email-value timestamp">$($email.message_id)</span>
                </div>
                <div class="email-field">
                    <span class="email-label">Created:</span>
                    <span class="email-value timestamp">$createdAt</span>
                </div>
                <div class="email-field">
                    <span class="email-label">ID:</span>
                    <span class="email-value timestamp">$($email.id)</span>
                </div>
            </div>
        </div>
        <div class="email-body">
            <div class="email-body-content">
                $($email.body)
            </div>
        </div>
    </div>
"@
}

$html += @"
</body>
</html>
"@

$html | Out-File -FilePath $logFile -Encoding UTF8

Write-Host "`nEmail logs exported successfully!" -ForegroundColor Green
Write-Host "File: $logFile" -ForegroundColor Cyan
Write-Host "`nTo view the logs, open the HTML file in your browser." -ForegroundColor Yellow



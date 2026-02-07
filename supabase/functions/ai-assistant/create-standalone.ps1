# Create standalone version of ai-assistant with inlined shared code

# Read the standalone header
$header = Get-Content 'index-standalone.ts' -Raw

# Read the original index.ts and skip the first 4 lines (imports)
$original = Get-Content 'index.ts' | Select-Object -Skip 4

# Combine and write
$combined = $header + ($original -join "`n")
$combined | Out-File -FilePath 'index-standalone.ts' -Encoding UTF8 -NoNewline

Write-Host "Created index-standalone.ts successfully!"
Write-Host "File size: $((Get-Item 'index-standalone.ts').Length) bytes"

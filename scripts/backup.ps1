$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path "backups/$stamp" | Out-Null
Copy-Item "data/baitul-jalal.db" "backups/$stamp/"
Compress-Archive -Path "uploads/*" -DestinationPath "backups/$stamp/uploads.zip" -Force
Write-Host "Backup tersimpan di backups/$stamp"

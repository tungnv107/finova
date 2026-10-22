# Finova PostgreSQL custom-format backup. Does not stop or modify the database.
[CmdletBinding()]
param([string]$OutputPath = "")
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
  $OutputPath = Join-Path $repo ('artifacts/backups/finova-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath)
$scratch = 'finova-backup-' + [guid]::NewGuid().ToString('N') + '.dump'
Push-Location $repo
try {
  $container = (& docker compose ps -q db)
  if ($LASTEXITCODE -ne 0 -or -not $container) { throw 'Finova database container is unavailable.' }
  $container = ($container | Select-Object -First 1).Trim()
  & docker exec $container pg_dump -U finova -d finova -Fc --no-owner --no-acl -f ('/tmp/' + $scratch)
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
  & docker exec $container pg_restore -l ('/tmp/' + $scratch) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not read backup archive.' }
  & docker cp "${container}:/tmp/$scratch" $OutputPath
  if ($LASTEXITCODE -ne 0) { throw 'docker cp failed.' }
  $file = Get-Item $OutputPath
  if ($file.Length -le 0) { throw 'Backup output was empty.' }
  Write-Output "Backup created: $($file.FullName) ($($file.Length) bytes)"
  Write-Output "SHA256: $((Get-FileHash -Algorithm SHA256 $OutputPath).Hash)"
} finally {
  if ($container) { & docker exec $container rm -f ('/tmp/' + $scratch) | Out-Null }
  Pop-Location
}

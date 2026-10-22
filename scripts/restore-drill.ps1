# Restore check in a new, temporary database within Finova's PostgreSQL container.
# The existing finova database is never a restore target.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$BackupPath)
$ErrorActionPreference = 'Stop'
$BackupPath = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -PathType Leaf $BackupPath)) { throw 'Backup file not found.' }
$repo = Split-Path -Parent $PSScriptRoot
$suffix = [guid]::NewGuid().ToString('N')
$restoreDb = 'finova_verify_' + $suffix.Substring(0, 12)
$scratch = '/tmp/finova-verify-' + $suffix + '.dump'
$verifySqlScratch = '/tmp/finova-verify-' + $suffix + '.sql'
$dbCreated = $false
$container = $null
Push-Location $repo
try {
  $container = (& docker compose ps -q db)
  if ($LASTEXITCODE -ne 0 -or -not $container) { throw 'Finova database container is unavailable.' }
  $container = ($container | Select-Object -First 1).Trim()
  & docker cp $BackupPath "${container}:$scratch"
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy backup into isolated restore workspace.' }
  & docker exec $container pg_restore -l $scratch | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Invalid PostgreSQL backup archive.' }
  & docker exec $container createdb -U finova $restoreDb
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create temporary verification database.' }
  $dbCreated = $true
  $restoreTimer = [System.Diagnostics.Stopwatch]::StartNew()
  & docker exec $container pg_restore -U finova -d $restoreDb --no-owner --no-acl --exit-on-error $scratch
  $restoreTimer.Stop()
  if ($LASTEXITCODE -ne 0) { throw 'Restore to temporary database failed.' }
  & docker cp (Join-Path $PSScriptRoot 'verify-restored-ledger.sql') "${container}:$verifySqlScratch"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to copy restore verification SQL.' }
  $verification = & docker exec $container psql -U finova -d $restoreDb -v ON_ERROR_STOP=1 -At -f $verifySqlScratch
  if ($LASTEXITCODE -ne 0 -or -not ($verification -match '^(\d+)\|0$')) { throw "Restored migration/ledger verification failed: $verification" }
  $migrations = $Matches[1]
  Write-Output "Restore verified in isolated database $restoreDb; applied migrations: $migrations; unbalanced journals: 0; pg_restore wall time: $([math]::Round($restoreTimer.Elapsed.TotalSeconds, 2)) seconds."
} finally {
  if ($container) {
    $cleanupErrors = @()
    if ($dbCreated) {
      & docker exec $container dropdb -U finova --if-exists $restoreDb | Out-Null
      if ($LASTEXITCODE -ne 0) { $cleanupErrors += "temporary database $restoreDb" }
    }
    & docker exec $container rm -f $scratch $verifySqlScratch | Out-Null
    if ($LASTEXITCODE -ne 0) { $cleanupErrors += 'temporary restore archive/verification SQL' }
  }
  Pop-Location
  if ($cleanupErrors.Count -gt 0) { throw "Restore drill cleanup failed: $($cleanupErrors -join ', ')" }
}

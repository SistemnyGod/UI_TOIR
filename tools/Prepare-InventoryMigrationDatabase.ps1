param(
  [string]$TargetConnectionString = "Host=localhost;Port=5432;Database=patrol360;Username=patrol360;Password=patrol360_dev",
  [string]$LegacyConnectionString = "",
  [string]$ApiBaseUrl = "http://127.0.0.1:5080",
  [switch]$StartPostgres,
  [switch]$ApplyMigrations,
  [switch]$DryRunImport,
  [switch]$RunImport,
  [switch]$ExportReadiness,
  [switch]$IUnderstandThisIsCopy
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $RepoRoot
try {
  if ($RunImport -and -not $IUnderstandThisIsCopy) {
    throw "Refusing to run real legacy import without -IUnderstandThisIsCopy. Use only a restored copy/staging database."
  }

  if ($StartPostgres) {
    docker compose -f .\infra\docker\compose.yaml up -d postgres
  }

  if ($ApplyMigrations) {
    $previousConnection = $env:ConnectionStrings__Patrol360
    $env:ConnectionStrings__Patrol360 = $TargetConnectionString
    try {
      dotnet ef database update --project .\libs\infrastructure\Patrol360.Infrastructure.csproj --startup-project .\apps\api\Patrol360.Api.csproj --context Patrol360DbContext
      if ($LASTEXITCODE -ne 0) { throw "dotnet ef database update failed." }
    }
    finally {
      if ($null -eq $previousConnection) {
        Remove-Item Env:\ConnectionStrings__Patrol360 -ErrorAction SilentlyContinue
      }
      else {
        $env:ConnectionStrings__Patrol360 = $previousConnection
      }
    }
  }

  if ($DryRunImport -or $RunImport) {
    if ([string]::IsNullOrWhiteSpace($LegacyConnectionString)) {
      throw "LegacyConnectionString is required for import dry-run or import."
    }

    $previousLegacy = $env:INVENTORY_LEGACY_CONNECTION_STRING
    $env:INVENTORY_LEGACY_CONNECTION_STRING = $LegacyConnectionString
    try {
      $endpoint = if ($DryRunImport) { "$ApiBaseUrl/api/v1/inventory/legacy/import/dry-run" } else { "$ApiBaseUrl/api/v1/inventory/legacy/import" }
      Write-Host "Calling $endpoint"
      Invoke-RestMethod -Method Post -Uri $endpoint | ConvertTo-Json -Depth 20
    }
    finally {
      if ($null -eq $previousLegacy) {
        Remove-Item Env:\INVENTORY_LEGACY_CONNECTION_STRING -ErrorAction SilentlyContinue
      }
      else {
        $env:INVENTORY_LEGACY_CONNECTION_STRING = $previousLegacy
      }
    }
  }

  if ($ExportReadiness) {
    & .\tools\Export-InventoryMigrationReadiness.ps1
  }
}
finally {
  Pop-Location
}

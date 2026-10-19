param(
  [string]$TargetConnectionString = "",
  [string]$LegacyConnectionString = "",
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
  if ([string]::IsNullOrWhiteSpace($TargetConnectionString)) { throw "An explicit restored-copy TargetConnectionString is required." }
  $targetBuilder = [System.Data.Common.DbConnectionStringBuilder]::new()
  $targetBuilder.ConnectionString = $TargetConnectionString
  if (-not $targetBuilder.ContainsKey('Database') -or $targetBuilder.ContainsKey('Initial Catalog') -or [string]$targetBuilder['Database'] -notmatch '^patrol360_migration_[a-zA-Z0-9_]+$') {
    throw "Target database must be named patrol360_migration_*. Production import is disabled. Use the Database connection-string key."
  }
  if ($DryRunImport -and $RunImport) { throw "Choose either -DryRunImport or -RunImport." }
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

    $previousTarget = $env:INVENTORY_MIGRATION_TARGET
    $env:INVENTORY_MIGRATION_TARGET = $TargetConnectionString
    $previousLegacy = $env:INVENTORY_LEGACY_CONNECTION_STRING
    $env:INVENTORY_LEGACY_CONNECTION_STRING = $LegacyConnectionString
    try {
      $mode = if ($DryRunImport) { "--dry-run" } else { "--import" }
      dotnet run --project .\tools\Patrol360.InventoryMigration\Patrol360.InventoryMigration.csproj -- $mode
      if ($LASTEXITCODE -ne 0) { throw "Isolated legacy import failed." }
    }
    finally {
      if ($null -eq $previousTarget) { Remove-Item Env:\INVENTORY_MIGRATION_TARGET -ErrorAction SilentlyContinue } else { $env:INVENTORY_MIGRATION_TARGET = $previousTarget }
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

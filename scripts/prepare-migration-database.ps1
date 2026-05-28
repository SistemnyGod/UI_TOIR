$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
& (Join-Path $Root "tools\Prepare-InventoryMigrationDatabase.ps1") @args

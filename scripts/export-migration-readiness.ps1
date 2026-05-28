$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
& (Join-Path $Root "tools\Export-InventoryMigrationReadiness.ps1") @args

param(
  [string]$OutputPath = "output/inventory-migration-readiness-baseline.json",
  [string]$ComposeFile = "infra/docker/compose.yaml",
  [string]$Database = "patrol360",
  [string]$User = "patrol360",
  [string]$Service = "postgres",
  [switch]$UseLocalPsql
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $RepoRoot
try {
  $ResolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $RepoRoot $OutputPath }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ResolvedOutputPath) | Out-Null

  $Sql = @'
select jsonb_pretty(
  jsonb_build_object(
    'generatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'database', current_database(),
    'latestMigration', coalesce((select "MigrationId" from "__EFMigrationsHistory" order by "MigrationId" desc limit 1), ''),
    'counts', jsonb_build_object(
      'inventory.categories', (select count(*) from inventory.categories),
      'inventory.units', (select count(*) from inventory.units),
      'inventory.warehouses', (select count(*) from inventory.warehouses),
      'inventory.items', (select count(*) from inventory.items),
      'inventory.stock_moves', (select count(*) from inventory.stock_moves),
      'inventory.custody_documents', (select count(*) from inventory.custody_documents),
      'inventory.custody_records', (select count(*) from inventory.custody_records),
      'inventory.custody_record_events', (select count(*) from inventory.custody_record_events),
      'inventory.ppe_cards', (select count(*) from inventory.ppe_cards),
      'inventory.ppe_card_lines', (select count(*) from inventory.ppe_card_lines),
      'inventory.ppe_card_line_events', (select count(*) from inventory.ppe_card_line_events),
      'inventory.item_sets', (select count(*) from inventory.item_sets),
      'inventory.position_norms', (select count(*) from inventory.position_norms),
      'inventory.system_log', (select count(*) from inventory.system_log),
      'inventory.legacy_import_runs', (select count(*) from inventory.legacy_import_runs)
    ),
    'lastLegacyImportRuns',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'createdAt', created_at,
        'completedAt', completed_at,
        'status', status,
        'dryRun', dry_run,
        'insertedRows', rows_inserted,
        'updatedRows', rows_updated,
        'skippedRows', rows_skipped,
        'error', error
      ) order by created_at desc)
      from (
        select id, created_at, completed_at, status, dry_run, rows_inserted, rows_updated, rows_skipped, error
        from inventory.legacy_import_runs
        order by created_at desc
        limit 5
      ) runs
    ), '[]'::jsonb)
  )
) as readiness_json;
'@

  if ($UseLocalPsql) {
    $Json = $Sql | psql -v ON_ERROR_STOP=1 -U $User -d $Database -t -A
  }
  else {
    $TempSqlRelative = "output\inventory-readiness.sql"
    $TempSql = Join-Path $RepoRoot $TempSqlRelative
    [System.IO.File]::WriteAllText($TempSql, $Sql, [System.Text.UTF8Encoding]::new($false))
    docker compose -f $ComposeFile cp $TempSqlRelative ${Service}:/tmp/inventory-readiness.sql
    if ($LASTEXITCODE -ne 0) { throw "Failed to copy readiness SQL into container." }
    $Json = docker compose -f $ComposeFile exec -T $Service psql -v ON_ERROR_STOP=1 -U $User -d $Database -t -A -f /tmp/inventory-readiness.sql
    if ($LASTEXITCODE -ne 0) { throw "Failed to export inventory readiness from PostgreSQL." }
    docker compose -f $ComposeFile exec -T $Service rm -f /tmp/inventory-readiness.sql | Out-Null
  }

  [System.IO.File]::WriteAllText($ResolvedOutputPath, (($Json -join [Environment]::NewLine).Trim() + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
  Write-Host "Inventory migration readiness baseline:"
  Write-Host $ResolvedOutputPath
}
finally {
  Pop-Location
}

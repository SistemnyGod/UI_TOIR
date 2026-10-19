# Builds the verified PPE-only snapshot. Production deployment is explicitly
# selected with -Deploy and ALWAYS keeps issuance off. Does not run migrations.
param([switch]$Deploy, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDir = Join-Path $repoRoot 'output/ppe-recovery-20261004'
$snapshot = Join-Path $outputDir 'release-source'
$manifestPath = Join-Path $outputDir 'release-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$baseline = Get-Content -LiteralPath (Join-Path $outputDir 'baseline-web-verification.json') -Raw | ConvertFrom-Json
if (@($baseline).Count -ne 32 -or @($baseline | Where-Object { -not $_.same }).Count -ne 0) { throw 'Deployed web baseline was not verified.' }
if ($manifest.issuanceEnabled -or $manifest.databaseMigrationRequired) { throw 'This release must keep issuance off and require no migrations.' }
foreach ($source in $manifest.sources) {
  $path = Join-Path $snapshot $source.path
  if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $source.sha256) { throw "Snapshot was changed after verification: $($source.path)" }
}
foreach ($source in $manifest.releaseControls) {
  if ((Get-FileHash -LiteralPath (Join-Path $repoRoot $source.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $source.sha256) { throw "Release configuration changed after verification: $($source.path)" }
}
function Invoke-Checked([string]$Program, [string[]]$CommandArgs) {
  & $Program @CommandArgs
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
function Read-Container([string]$Name) {
  $result = & docker inspect $Name --format '{{json .}}'
  if ($LASTEXITCODE -ne 0) { throw "Cannot inspect $Name" }
  return ($result | ConvertFrom-Json)
}
function Set-ReleaseEnvironment([string]$Name, [string]$Value) {
  if (-not $previousEnvironment.ContainsKey($Name)) { $previousEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
  [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}
function Read-EnvironmentValue($Container, [string]$Name) {
  $entry = $Container.Config.Env | Where-Object { $_.StartsWith($Name + '=', [StringComparison]::Ordinal) } | Select-Object -First 1
  if ($null -eq $entry) { throw "Running container does not define $Name" }
  return $entry.Substring($Name.Length + 1)
}
function Read-History {
  $sql = @'
SELECT json_build_object(
 'cards',(SELECT count(*) FROM inventory.ppe_cards),
 'lines',(SELECT count(*) FROM inventory.ppe_card_lines),
 'normSets',(SELECT count(*) FROM inventory.ppe_norm_sets),
 'mappings',(SELECT count(*) FROM inventory.ppe_norm_catalog_mappings WHERE archived_at IS NULL),
 'templates',(SELECT count(*) FROM inventory.ppe_issue_templates),
 'documents',(SELECT count(*) FROM inventory.ppe_issue_documents),
 'historicalStockMoves',(SELECT count(*) FROM inventory.stock_moves WHERE move_type LIKE 'ppe_%' OR ppe_card_line_id IS NOT NULL),
 'cardsHash',(SELECT md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) FROM inventory.ppe_cards t),
 'linesHash',(SELECT md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) FROM inventory.ppe_card_lines t),
 'templatesHash',(SELECT md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) FROM inventory.ppe_issue_templates t),
 'stockHash',(SELECT md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) FROM inventory.stock_moves t WHERE move_type LIKE 'ppe_%' OR ppe_card_line_id IS NOT NULL));
'@
  $result = & docker exec patrol360-postgres psql -U patrol360 -d patrol360 -v ON_ERROR_STOP=1 -tAc $sql
  if ($LASTEXITCODE -ne 0) { throw 'Production history inspection failed.' }
  return ($result | ConvertFrom-Json)
}
$previousEnvironment = @{}
Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    Push-Location (Join-Path $repoRoot 'apps/web')
    try { Invoke-Checked 'npm' @('run','typecheck'); Invoke-Checked 'node' @('node_modules/vitest/vitest.mjs','run','--configLoader','runner','ppe') } finally { Pop-Location }
    Invoke-Checked 'dotnet' @('test','tests/Patrol360.Api.Tests/Patrol360.Api.Tests.csproj','--no-restore','-m:1','--disable-build-servers','-p:UseSharedCompilation=false','--filter','FullyQualifiedName~.Ppe')
    Push-Location (Join-Path $snapshot 'apps/web')
    try { Invoke-Checked 'npm' @('run','typecheck'); Invoke-Checked 'node' @('node_modules/vite/bin/vite.js','build','--configLoader','runner') } finally { Pop-Location }
    # Preserve one generation of hashed assets for already-open browser tabs.
    $oldAssets = Join-Path $outputDir 'production-web/assets'
    $newAssets = Join-Path $snapshot 'apps/web/dist/assets'
    foreach ($asset in Get-ChildItem -LiteralPath $oldAssets -File) {
      $destination = Join-Path $newAssets $asset.Name
      if (-not (Test-Path -LiteralPath $destination)) { Copy-Item -LiteralPath $asset.FullName -Destination $destination }
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot '.dockerignore') -Destination (Join-Path $snapshot '.dockerignore') -Force
    Push-Location $snapshot
    try {
      Invoke-Checked 'docker' @('build','--file','apps/api/Dockerfile','--tag','patrol360-api:ppe-20261004','--build-arg',"SOURCE_REVISION=$($manifest.sourceRevision)",'.')
      Invoke-Checked 'docker' @('build','--file','apps/web/Dockerfile.prebuilt','--tag','patrol360-web:ppe-20261004','--label',"org.opencontainers.image.revision=$($manifest.sourceRevision)",'.')
    } finally { Pop-Location }
    Invoke-Checked 'docker' @('build','--file','infra/docker/gotenberg/Dockerfile','--tag','patrol360-ppe-gotenberg:8.37.0','.')
  }
  if (-not $Deploy) { Write-Host 'Images prepared; production was not changed. Use -Deploy to publish with issuance OFF.'; return }
  foreach ($image in @('patrol360-api:ppe-20261004','patrol360-web:ppe-20261004')) {
    $revision = & docker image inspect $image --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
    if ($LASTEXITCODE -ne 0 -or $revision.Trim() -ne $manifest.sourceRevision) { throw "Wrong or stale release image: $image" }
  }
  $api = Read-Container 'patrol360-api'; $web = Read-Container 'patrol360-web'; $worker = Read-Container 'patrol360-worker'
  # Root .env contains network settings only. Reuse existing PostgreSQL secrets
  # in process memory; never print them or write them to a new environment file.
  $postgres = Read-Container 'patrol360-postgres'
  foreach ($name in @('POSTGRES_DB','POSTGRES_USER','POSTGRES_PASSWORD')) { Set-ReleaseEnvironment $name (Read-EnvironmentValue $postgres $name) }
  if ((Read-EnvironmentValue $postgres 'POSTGRES_DB') -ne 'patrol360' -or (Read-EnvironmentValue $postgres 'POSTGRES_USER') -ne 'patrol360') { throw 'Unexpected production database/user; review this deployment script first.' }
  Set-ReleaseEnvironment 'ASPNETCORE_ENVIRONMENT' (Read-EnvironmentValue $api 'ASPNETCORE_ENVIRONMENT')
  Set-ReleaseEnvironment 'WEB_CORS_ALLOWED_ORIGIN' (Read-EnvironmentValue $api 'WebCors__AllowedOrigins__0')
  Set-ReleaseEnvironment 'PATROL360_PROXY_IP' (Read-EnvironmentValue $api 'ForwardedHeaders__KnownProxies__0')
  $compose = @('compose','--project-name','docker','--env-file','.env','-f','infra/docker/compose.yaml','-f','infra/docker/compose.ppe-recovery.yaml','--profile','app','--profile','ppe-printing')
  Invoke-Checked 'docker' ($compose + @('config','--quiet'))
  $before = Read-History
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupPath = Join-Path $outputDir "production-predeploy-$stamp.dump"
  Invoke-Checked 'docker' @('exec','patrol360-postgres','pg_dump','-U','patrol360','-d','patrol360','-Fc','-f',"/tmp/ppe-predeploy-$stamp.dump")
  Invoke-Checked 'docker' @('exec','patrol360-postgres','pg_restore','--list',"/tmp/ppe-predeploy-$stamp.dump")
  Invoke-Checked 'docker' @('cp',"patrol360-postgres:/tmp/ppe-predeploy-$stamp.dump",$backupPath)
  Invoke-Checked 'docker' @('tag',$api.Image,"patrol360-api:before-ppe-$stamp")
  Invoke-Checked 'docker' @('tag',$web.Image,"patrol360-web:before-ppe-$stamp")
  $record = [ordered]@{ sourceRevision=$manifest.sourceRevision; issuanceEnabled=$false; backup=$backupPath; backupSha256=(Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash; before=$before; previousApiImage=$api.Image; previousWebImage=$web.Image; workerImage=$worker.Image; deployed=$false }
  $reportPath = Join-Path $outputDir "deployment-$stamp.json"
  $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Invoke-Checked 'docker' ($compose + @('up','-d','--no-deps','--no-build','api','web','gotenberg'))
  $deadline = (Get-Date).AddSeconds(90)
  do {
    $apiNow = Read-Container 'patrol360-api'; $webNow = Read-Container 'patrol360-web'
    if ($apiNow.State.Health.Status -eq 'healthy' -and $webNow.State.Health.Status -eq 'healthy') { break }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  if ($apiNow.State.Health.Status -ne 'healthy' -or $webNow.State.Health.Status -ne 'healthy') { throw "API/web health check failed. Keep issuance OFF; inspect $reportPath before rollback." }
  if ($apiNow.Config.Env -notcontains 'Features__PpeIssueDocuments=false') { throw 'Issuance flag is not OFF.' }
  $printer = Read-Container 'patrol360-gotenberg'
  if ($printer.HostConfig.Memory -ne 1073741824 -or $printer.HostConfig.NanoCpus -ne 2000000000 -or @($printer.NetworkSettings.Networks.PSObject.Properties.Name).Count -ne 1 -or $printer.HostConfig.PortBindings.PSObject.Properties.Count -gt 0) { throw 'Printer isolation/resource limits do not match the plan.' }
  if ((Read-Container 'patrol360-worker').Image -ne $worker.Image) { throw 'Worker was unexpectedly changed.' }
  $after = Read-History
  $record.after = $after; $record.deployed = $true
  $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8
  if (($before | ConvertTo-Json -Compress) -ne ($after | ConvertTo-Json -Compress)) { throw "History changed during deployment; investigate concurrent business actions. Report: $reportPath" }
  Write-Host "Published $($manifest.sourceRevision) with issuance OFF. Review all 34 sets and 79 mappings in the UI. Report: $reportPath"
} finally {
  foreach ($name in $previousEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
  Pop-Location
}

param(
  [Parameter(Mandatory = $true)] [string]$ConnectionString,
  [Parameter(Mandatory = $true)] [string[]]$ContainerNames,
  [int]$IntervalSeconds = 10,
  [string]$ResultsDirectory = "TestResults\\performance"
)

$ErrorActionPreference = "Stop"
if ($ConnectionString -notmatch "(?i)(database|dbname)=patrol360_perf_[^; ]+") {
  throw "Performance collection is restricted to a database named patrol360_perf_*"
}
if ($IntervalSeconds -lt 1) { throw "IntervalSeconds must be positive." }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw "psql is required." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "docker is required." }

function ConvertTo-PsqlConnectionString([string]$Value) {
  if ($Value -notmatch "(?i)Host=") { return $Value }
  $properties = @{}
  foreach ($part in $Value -split ";") {
    if ($part -match "^\\s*([^=]+)=(.*)$") { $properties[$matches[1].Trim().ToLowerInvariant()] = $matches[2].Trim() }
  }
  $port = if ($properties["port"]) { $properties["port"] } else { "5432" }
  return "postgresql://$([uri]::EscapeDataString($properties['username'])):$([uri]::EscapeDataString($properties['password']))@$($properties['host']):$port/$($properties['database'])"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resultsRoot = if ([IO.Path]::IsPathRooted($ResultsDirectory)) { $ResultsDirectory } else { Join-Path $repoRoot $ResultsDirectory }
New-Item -ItemType Directory -Force -Path $resultsRoot | Out-Null
$output = Join-Path $resultsRoot "runtime-$([DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')).jsonl"
$psqlConnection = ConvertTo-PsqlConnectionString $ConnectionString

while ($true) {
  $timestamp = [DateTimeOffset]::UtcNow.ToString("O")
  $containers = @(& docker stats --no-stream --format '{{json .}}' $ContainerNames | ForEach-Object { $_ | ConvertFrom-Json })
  if ($LASTEXITCODE -ne 0) { throw "docker stats failed with exit code $LASTEXITCODE" }
  $database = & psql --dbname $psqlConnection --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT json_build_object('activeConnections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()),'waitingLocks',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),'databaseSizeBytes',pg_database_size(current_database()))::text;"
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL metric query failed with exit code $LASTEXITCODE" }
  [ordered]@{ timestampUtc = $timestamp; containers = $containers; postgres = ($database | Select-Object -Last 1 | ConvertFrom-Json) } |
    ConvertTo-Json -Depth 5 -Compress | Add-Content -LiteralPath $output -Encoding utf8
  Start-Sleep -Seconds $IntervalSeconds
}

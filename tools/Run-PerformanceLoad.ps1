param(
  [Parameter(Mandatory = $true)] [string]$ConfigurationPath,
  [string]$ResultsDirectory = "TestResults\\performance",
  [switch]$RepeatThreeTimes
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$configuration = Resolve-Path -LiteralPath $ConfigurationPath
$resultsRoot = if ([IO.Path]::IsPathRooted($ResultsDirectory)) { $ResultsDirectory } else { Join-Path $repoRoot $ResultsDirectory }
New-Item -ItemType Directory -Force -Path $resultsRoot | Out-Null

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
  throw "k6 is required for the 100-client load scenario. Install it separately; do not run the scenario against a working server."
}

$config = Get-Content -LiteralPath $configuration -Raw | ConvertFrom-Json
if (@($config.webTokens).Count -lt 50 -or @($config.mobileActors).Count -lt 50) {
  throw "The load configuration must contain at least 50 distinct web tokens and 50 mobile actors."
}
if ([string]::IsNullOrWhiteSpace($config.apiBaseUrl) -or [string]::IsNullOrWhiteSpace($config.contourId)) {
  throw "apiBaseUrl and contourId are required."
}
foreach ($actor in @($config.mobileActors)) {
  if ([string]::IsNullOrWhiteSpace($actor.token) -or @($actor.outboxCommands).Count -ne 20) {
    throw "Every mobile actor needs a token and exactly 20 valid idempotent outbox commands."
  }
  if ($actor.fileTarget -and @($actor.fileTarget.clientFileIds).Count -ne 2) {
    throw "Every configured fileTarget needs exactly two clientFileIds."
  }
}

$script = Join-Path $repoRoot "tools\\performance\\load-100-clients.js"
$runs = if ($RepeatThreeTimes) { 3 } else { 1 }
for ($run = 1; $run -le $runs; $run++) {
  $stamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMdd-HHmmss")
  $summary = Join-Path $resultsRoot "load-$stamp-run$run-summary.json"
  $environment = "PATROL360_PERF_CONFIG=$configuration"
  & k6 run --env $environment --summary-export $summary $script
  if ($LASTEXITCODE -ne 0) { throw "k6 load run $run failed with exit code $LASTEXITCODE" }
}

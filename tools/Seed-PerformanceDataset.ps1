param(
  [Parameter(Mandatory = $true)]
  [string]$ConnectionString
)

$ErrorActionPreference = "Stop"

if ($ConnectionString -notmatch "(?i)(database|dbname)=patrol360_perf_[^; ]+") {
  throw "Performance seeding is restricted to a database named patrol360_perf_*"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$seedFile = Join-Path $repoRoot "tools\performance\seed.sql"
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql is required for the opt-in performance dataset."
}

& psql --dbname $ConnectionString --set ON_ERROR_STOP=1 --file $seedFile
if ($LASTEXITCODE -ne 0) {
  throw "Performance dataset seeding failed with exit code $LASTEXITCODE"
}

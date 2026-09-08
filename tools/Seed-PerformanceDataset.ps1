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

function ConvertTo-PsqlConnectionString([string]$Value) {
  if ($Value -notmatch "(?i)Host=") { return $Value }
  $properties = @{}
  foreach ($part in $Value -split ";") {
    if ($part -match "^\s*([^=]+)=(.*)$") { $properties[$matches[1].Trim().ToLowerInvariant()] = $matches[2].Trim() }
  }
  $hostName = $properties["host"]
  $port = if ($properties["port"]) { $properties["port"] } else { "5432" }
  $database = $properties["database"]
  $user = [uri]::EscapeDataString($properties["username"])
  $password = [uri]::EscapeDataString($properties["password"])
  return "postgresql://${user}:${password}@${hostName}:${port}/${database}"
}

$psqlConnection = ConvertTo-PsqlConnectionString $ConnectionString
& psql --dbname $psqlConnection --set ON_ERROR_STOP=1 --file $seedFile
if ($LASTEXITCODE -ne 0) {
  throw "Performance dataset seeding failed with exit code $LASTEXITCODE"
}

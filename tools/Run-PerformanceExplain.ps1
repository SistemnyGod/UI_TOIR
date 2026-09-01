param(
  [Parameter(Mandatory = $true)]
  [string]$ConnectionString,

  [string]$Query = "perf",

  [string]$ResultsDirectory = "TestResults\performance"
)

$ErrorActionPreference = "Stop"

if ($ConnectionString -notmatch "(?i)(database|dbname)=patrol360_perf_[^; ]+") {
  throw "Performance explain is restricted to a database named patrol360_perf_*"
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql is required for the opt-in performance probe."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resultsRoot = if ([System.IO.Path]::IsPathRooted($ResultsDirectory)) { $ResultsDirectory } else { Join-Path $repoRoot $ResultsDirectory }
New-Item -ItemType Directory -Force -Path $resultsRoot | Out-Null
$explainFile = Join-Path $repoRoot "tools\performance\explain.sql"
$outputFile = Join-Path $resultsRoot "explain-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss')).jsonl"

& psql --dbname $ConnectionString --set ON_ERROR_STOP=1 --set "search=$Query" --file $explainFile --tuples-only --no-align | Set-Content -LiteralPath $outputFile -Encoding utf8
if ($LASTEXITCODE -ne 0) {
  throw "Performance EXPLAIN failed with exit code $LASTEXITCODE"
}
Write-Output $outputFile

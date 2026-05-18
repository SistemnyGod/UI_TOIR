param(
  [switch]$SkipFrontendInstall,
  [switch]$IncludeE2E,
  [switch]$CollectCoverage,
  [string]$ResultsDirectory = "TestResults"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resultsRoot = if ([System.IO.Path]::IsPathRooted($ResultsDirectory)) {
  $ResultsDirectory
}
else {
  Join-Path $repoRoot $ResultsDirectory
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  $dotnetResults = Join-Path $resultsRoot "dotnet"
  $vitestResults = Join-Path $resultsRoot "vitest"
  New-Item -ItemType Directory -Force -Path $dotnetResults, $vitestResults | Out-Null

  Invoke-Native dotnet restore .\Patrol360.slnx
  Invoke-Native dotnet build .\Patrol360.slnx --no-restore
  Invoke-Native dotnet format .\Patrol360.slnx --verify-no-changes --no-restore

  $dotnetTestArgs = @(
    "test",
    ".\Patrol360.slnx",
    "--no-build",
    "--logger",
    "trx",
    "--results-directory",
    $dotnetResults
  )

  if ($CollectCoverage) {
    $dotnetTestArgs += @("--collect", "XPlat Code Coverage")
  }

  Invoke-Native dotnet @dotnetTestArgs
  Invoke-Native dotnet run --project .\tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore
  .\tools\Verify-TextEncoding.ps1

  Push-Location .\apps\web
  try {
    if (-not $SkipFrontendInstall) {
      Invoke-Native npm ci
    }

    Invoke-Native npm run verify
    Invoke-Native npm run test:ci

    if ($IncludeE2E) {
      $previousCi = $env:CI
      $env:CI = "true"
      try {
        Invoke-Native npm run test:e2e
      }
      finally {
        if ($null -eq $previousCi) {
          Remove-Item Env:\CI -ErrorAction SilentlyContinue
        }
        else {
          $env:CI = $previousCi
        }
      }
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}

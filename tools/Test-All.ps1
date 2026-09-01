param(
  [switch]$SkipFrontendInstall,
  [switch]$IncludeE2E,
  [switch]$IncludeDbIntegration,
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

function Invoke-DotnetTestProject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [Parameter(Mandatory = $true)]
    [string]$ProjectName,

    [Parameter(Mandatory = $true)]
    [string]$ResultsPath,

    [switch]$CollectCoverage
  )

  $arguments = @(
    "test",
    $ProjectPath,
    "--no-build",
    "--logger",
    "trx;LogFileName=$ProjectName.trx",
    "--results-directory",
    $ResultsPath,
    "--blame-hang-timeout",
    "5m",
    "--blame-hang-dump-type",
    "mini",
    "--diag",
    (Join-Path $ResultsPath "$ProjectName.diagnostic.log")
  )

  if ($CollectCoverage) {
    $arguments += @("--collect", "XPlat Code Coverage")
  }

  Invoke-Native dotnet @arguments
}

Push-Location $repoRoot
try {
  $dotnetResults = Join-Path $resultsRoot "dotnet"
  $vitestResults = Join-Path $resultsRoot "vitest"
  New-Item -ItemType Directory -Force -Path $dotnetResults, $vitestResults | Out-Null

  Invoke-Native dotnet restore .\Patrol360.slnx
  Invoke-Native dotnet build .\Patrol360.slnx --no-restore
  Invoke-Native dotnet format .\Patrol360.slnx --verify-no-changes --no-restore

  $previousDbIntegration = $env:PATROL360_RUN_DB_INTEGRATION
  $previousDbAdminConnectionString = $env:PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING
  try {
    # The ordinary suite must never inherit a DB switch from the calling shell.
    Remove-Item Env:\PATROL360_RUN_DB_INTEGRATION -ErrorAction SilentlyContinue
    Remove-Item Env:\PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING -ErrorAction SilentlyContinue

    $dotnetProjects = @(
      @{ Path = ".\tests\Patrol360.Domain.Tests\Patrol360.Domain.Tests.csproj"; Name = "Patrol360.Domain.Tests" },
      @{ Path = ".\tests\Patrol360.Application.Tests\Patrol360.Application.Tests.csproj"; Name = "Patrol360.Application.Tests" },
      @{ Path = ".\tests\Patrol360.Api.Tests\Patrol360.Api.Tests.csproj"; Name = "Patrol360.Api.Tests" },
      @{ Path = ".\tests\Patrol360.Worker.Tests\Patrol360.Worker.Tests.csproj"; Name = "Patrol360.Worker.Tests" },
      @{ Path = ".\tests\Patrol360.Infrastructure.Tests\Patrol360.Infrastructure.Tests.csproj"; Name = "Patrol360.Infrastructure.Tests" }
    )

    foreach ($project in $dotnetProjects) {
      Invoke-DotnetTestProject -ProjectPath $project.Path -ProjectName $project.Name -ResultsPath $dotnetResults -CollectCoverage:$CollectCoverage
    }

    if ($IncludeDbIntegration) {
      $env:PATROL360_RUN_DB_INTEGRATION = "true"
      if ([string]::IsNullOrWhiteSpace($env:PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING)) {
        $env:PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING = "Host=localhost;Port=5432;Database=postgres;Username=patrol360;Password=patrol360_dev"
      }

      $dbResults = Join-Path $dotnetResults "db"
      New-Item -ItemType Directory -Force -Path $dbResults | Out-Null
      Invoke-DotnetTestProject `
        -ProjectPath ".\tests\Patrol360.Infrastructure.Tests\Patrol360.Infrastructure.Tests.csproj" `
        -ProjectName "Patrol360.Infrastructure.Tests.DbIntegration" `
        -ResultsPath $dbResults
    }
  }
  finally {
    if ($null -eq $previousDbIntegration) {
      Remove-Item Env:\PATROL360_RUN_DB_INTEGRATION -ErrorAction SilentlyContinue
    }
    else {
      $env:PATROL360_RUN_DB_INTEGRATION = $previousDbIntegration
    }

    if ($null -eq $previousDbAdminConnectionString) {
      Remove-Item Env:\PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING -ErrorAction SilentlyContinue
    }
    else {
      $env:PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING = $previousDbAdminConnectionString
    }
  }
  Invoke-Native dotnet run --project .\tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore
  .\tools\Verify-TextEncoding.ps1

  Push-Location .\apps\web
  try {
    # npm ci is intentionally unconditional: a missing compiler is a preparation failure.
    Invoke-Native npm ci
    if (-not (Test-Path ".\node_modules\.bin\tsc.cmd")) {
      throw "Frontend preparation failed: npm ci completed without node_modules/.bin/tsc.cmd."
    }

    try {
      Invoke-Native npm run typecheck
      Invoke-Native npm run build
      Invoke-Native npm run test:ci
    }
    catch {
      if ($_.Exception.Message -match "spawn EPERM") {
        throw "Frontend checks reached the installed dependency tree, but Windows denied the Vite child process (spawn EPERM). Inspect the runner policy or process limits."
      }
      throw
    }

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

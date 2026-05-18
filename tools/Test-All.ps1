param(
  [switch]$SkipFrontendInstall,
  [switch]$IncludeE2E
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

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
  Invoke-Native dotnet restore .\Patrol360.slnx
  Invoke-Native dotnet build .\Patrol360.slnx --no-restore
  Invoke-Native dotnet test .\Patrol360.slnx --no-build
  Invoke-Native dotnet run --project .\tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore
  .\tools\Verify-TextEncoding.ps1

  Push-Location .\apps\web
  try {
    if (-not $SkipFrontendInstall) {
      Invoke-Native npm ci
    }

    Invoke-Native npm run verify
    Invoke-Native npm run test:run

    if ($IncludeE2E) {
      Invoke-Native npm run test:e2e
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}

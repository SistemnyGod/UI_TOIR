$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$testProject = Join-Path $repoRoot "tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj"

& dotnet run --project $testProject
if ($LASTEXITCODE -ne 0) {
  throw "dotnet structure tests failed with exit code $LASTEXITCODE"
}

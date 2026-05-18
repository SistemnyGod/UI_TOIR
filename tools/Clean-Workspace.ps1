param(
  [switch]$IncludeNodeModules
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Assert-InRepo {
  param([string]$PathToCheck)

  $fullPath = [System.IO.Path]::GetFullPath($PathToCheck)
  $rootWithSeparator = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

  if ($fullPath -ne $repoRoot -and -not $fullPath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside repository: $fullPath"
  }

  return $fullPath
}

function Remove-GeneratedPath {
  param([string]$PathToRemove)

  if (-not (Test-Path -LiteralPath $PathToRemove)) {
    return
  }

  $safePath = Assert-InRepo $PathToRemove
  Write-Host "Removing $safePath"
  Remove-Item -LiteralPath $safePath -Recurse -Force
}

$fixedTargets = @(
  "output",
  "TestResults",
  "coverage",
  "apps/web/dist",
  "apps/web/.vite",
  "apps/web/test-results",
  "apps/web/playwright-report",
  "apps/web/coverage"
)

foreach ($relativeTarget in $fixedTargets) {
  Remove-GeneratedPath (Join-Path $repoRoot $relativeTarget)
}

$scanRoots = @("apps", "libs", "tests")
foreach ($relativeRoot in $scanRoots) {
  $scanRoot = Join-Path $repoRoot $relativeRoot
  if (-not (Test-Path -LiteralPath $scanRoot)) {
    continue
  }

  Get-ChildItem -LiteralPath $scanRoot -Directory -Recurse -Force |
    Where-Object {
      $_.Name -in @("bin", "obj", "TestResults", "coverage") -and
      $_.FullName -notlike "*\node_modules\*"
    } |
    ForEach-Object { Remove-GeneratedPath $_.FullName }
}

if ($IncludeNodeModules) {
  Remove-GeneratedPath (Join-Path $repoRoot "apps/web/node_modules")
}

Write-Host "Workspace clean completed."

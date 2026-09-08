[CmdletBinding()]
param([string]$OutputPath = "artifacts/build-manifest.json", [string[]]$ArtifactPaths = @())
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
function Invoke-Native([string]$FilePath, [string[]]$Arguments) {
  $value = & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
  return ($value | Out-String).Trim()
}
function Get-RelativePath([string]$Path) {
  return ((Resolve-Path -LiteralPath $Path -Relative) -replace '^\.\\', '')
}
Push-Location $repoRoot
try {
  $revision = Invoke-Native git @("rev-parse", "HEAD")
  $dirty = -not [string]::IsNullOrWhiteSpace((Invoke-Native git @("status", "--porcelain")))
  $trackedLocks = @(& git ls-files "*package-lock.json" "*packages.lock.json" "*gradle.lockfile")
  if ($LASTEXITCODE -ne 0) { throw "git ls-files failed with exit code $LASTEXITCODE" }
  $lockFiles = @($trackedLocks | Where-Object { $_ } | ForEach-Object { Get-Item (Join-Path $repoRoot $_) })
  $artifacts = foreach ($item in $ArtifactPaths) {
    $resolved = Resolve-Path $item -ErrorAction Stop
    $files = if (Test-Path -LiteralPath $resolved.Path -PathType Container) {
      Get-ChildItem -LiteralPath $resolved.Path -File -Recurse | Sort-Object FullName
    } else { Get-Item -LiteralPath $resolved.Path }
    foreach ($file in $files) {
      [ordered]@{ path = Get-RelativePath $file.FullName; sha256 = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
  }
  $locks = foreach ($item in $lockFiles) {
    [ordered]@{ path = Get-RelativePath $item.FullName; sha256 = (Get-FileHash $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  [string[]]$sourcePaths = @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard -- apps libs tests infra tools "mobiel proekt/src" "mobiel proekt/scripts" "mobiel proekt/package.json" "mobiel proekt/package-lock.json" "mobiel proekt/app.config.js" Directory.Build.props global.json .dockerignore .gitignore)
  if ($LASTEXITCODE -ne 0) { throw "Source inventory failed." }
  [Array]::Sort($sourcePaths, [StringComparer]::Ordinal)
  $sourceFiles = @(foreach ($sourcePath in $sourcePaths) {
    if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
      [ordered]@{ path = $sourcePath; sha256 = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
  })
  $sourceInventory = ($sourceFiles | ForEach-Object { $_.path + "=" + $_.sha256 }) -join "`n"
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $sourceHash = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($sourceInventory))).Replace("-", "").ToLowerInvariant() }
  finally { $hasher.Dispose() }
  $manifest = [ordered]@{ generatedAtUtc = [DateTimeOffset]::UtcNow.ToString("O"); commit = $revision; dirty = $dirty; sourceTreeSha256 = $sourceHash;
    tools = [ordered]@{ dotnet = Invoke-Native dotnet @("--version"); node = Invoke-Native node @("--version"); npm = Invoke-Native npm @("--version"); docker = Invoke-Native docker @("--version") };
    lockFiles = $locks; artifacts = @($artifacts); sourceFiles = $sourceFiles }
  $destination = if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $repoRoot $OutputPath }
  New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $destination -Encoding utf8
  Write-Output $destination
}
finally { Pop-Location }

param(
  [Parameter(Mandatory = $true)][string]$InputApk,
  [Parameter(Mandatory = $true)][string]$OutputApk
)

$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$policy = Get-Content (Join-Path $project 'release-signing.json') -Raw | ConvertFrom-Json
$metadata = Get-Content (Join-Path $project 'secrets/patrol360-release.machine.dpapi.json') -Raw | ConvertFrom-Json
if ($metadata.alias -ne $policy.keyAlias) { throw 'Signing alias differs from release policy.' }
$tools = Join-Path $env:LOCALAPPDATA 'Android/Sdk/build-tools/36.0.0'
$aligned = $OutputApk + '.aligned.apk'
Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes('Patrol360.ReleaseSigning.v1')
$protected = [Convert]::FromBase64String($metadata.encryptedPassword)
try {
  if ($metadata.protection -ne 'Windows DPAPI LocalMachine') { throw 'Unsupported signing metadata protection.' }
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $entropy, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = [Text.Encoding]::UTF8.GetString($plain)
  New-Item -ItemType Directory -Force -Path (Split-Path $OutputApk -Parent) | Out-Null
  & (Join-Path $tools 'zipalign.exe') -f -p 4 $InputApk $aligned
  if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
  & (Join-Path $tools 'apksigner.bat') sign --ks $metadata.keystorePath --ks-key-alias $metadata.alias --ks-pass env:PATROL360_ANDROID_KEYSTORE_PASSWORD --key-pass env:PATROL360_ANDROID_KEYSTORE_PASSWORD --out $OutputApk $aligned
  if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
  $verification = & (Join-Path $tools 'apksigner.bat') verify --verbose --print-certs $OutputApk
  if ($LASTEXITCODE -ne 0 -or ($verification -join "`n") -notmatch [regex]::Escape($policy.certificateSha256)) { throw 'APK signature differs from pinned release certificate.' }
  $badging = & (Join-Path $tools 'aapt.exe') dump badging $OutputApk
  if ($LASTEXITCODE -ne 0 -or ($badging -join "`n") -match 'application-debuggable') { throw 'APK release verification failed.' }
  $verification
  $badging | Select-String '^package:|^native-code:'
  Get-FileHash -Algorithm SHA256 $OutputApk
} finally {
  $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $null
  if ($plain) { [Array]::Clear($plain, 0, $plain.Length) }
  [Array]::Clear($protected, 0, $protected.Length)
  [Array]::Clear($entropy, 0, $entropy.Length)
  if (Test-Path -LiteralPath $aligned) { Remove-Item -LiteralPath $aligned }
}

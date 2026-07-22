param(
  [string]$SourceSecretPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'secrets\patrol360-release-v2.dpapi.json'),
  [string]$DestinationSecretPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'secrets\patrol360-release.machine.dpapi.json')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes('Patrol360.ReleaseSigning.v1')
$plainBytes = $null
$protectedBytes = $null
$pointer = [IntPtr]::Zero

if (-not (Test-Path -LiteralPath $SourceSecretPath)) {
  throw ('Source signing metadata not found: {0}' -f $SourceSecretPath)
}
if (Test-Path -LiteralPath $DestinationSecretPath) {
  throw ('Backup metadata already exists; refusing to overwrite it: {0}' -f $DestinationSecretPath)
}

$metadata = Get-Content -LiteralPath $SourceSecretPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($metadata.protection -ne 'Windows DPAPI CurrentUser') {
  throw 'Source metadata must use Windows DPAPI CurrentUser protection.'
}
if (-not (Test-Path -LiteralPath ([string]$metadata.keystorePath))) {
  throw ('Referenced keystore not found: {0}' -f $metadata.keystorePath)
}

try {
  $securePassword = ConvertTo-SecureString ([string]$metadata.encryptedPassword)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $plainBytes = [Text.Encoding]::UTF8.GetBytes($plainPassword)
  $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
    $plainBytes,
    $entropy,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
  )

  $backup = [ordered]@{
    version = 2
    keystorePath = [string]$metadata.keystorePath
    alias = [string]$metadata.alias
    encryptedPassword = [Convert]::ToBase64String($protectedBytes)
    protection = 'Windows DPAPI LocalMachine'
    sourceMetadata = Split-Path $SourceSecretPath -Leaf
    createdAt = [DateTimeOffset]::Now.ToString('O')
  } | ConvertTo-Json

  $directory = Split-Path $DestinationSecretPath -Parent
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  [IO.File]::WriteAllText($DestinationSecretPath, $backup, [Text.UTF8Encoding]::new($false))
  Write-Host ('Machine-level signing backup created: {0}' -f $DestinationSecretPath)
}
finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
  if ($protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
  [Array]::Clear($entropy, 0, $entropy.Length)
  $plainPassword = $null
  $securePassword = $null
}

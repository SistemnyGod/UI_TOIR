param(
  [string]$SecretPath = (Join-Path (Split-Path $PSScriptRoot -Parent) "secrets\patrol360-release.dpapi.json"),
  [string]$BuildRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SecretPath)) {
  throw "Encrypted release signing metadata not found: $SecretPath"
}

$metadata = Get-Content -LiteralPath $SecretPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($metadata.protection -ne "Windows DPAPI CurrentUser") {
  throw "Unsupported release secret protection: $($metadata.protection)"
}

if (-not (Test-Path -LiteralPath $metadata.keystorePath)) {
  throw "Release keystore not found: $($metadata.keystorePath)"
}

$securePassword = ConvertTo-SecureString $metadata.encryptedPassword
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:PATROL360_ANDROID_KEYSTORE = [string]$metadata.keystorePath
  $env:PATROL360_ANDROID_KEY_ALIAS = [string]$metadata.alias
  $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $plainPassword
  $env:PATROL360_ANDROID_KEY_PASSWORD = $plainPassword

  $buildArguments = @{
    Configuration = "Release"
  }
  if (-not [string]::IsNullOrWhiteSpace($BuildRoot)) {
    $buildArguments.BuildRoot = $BuildRoot
  }

  & (Join-Path $PSScriptRoot "build-apk.ps1") @buildArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Release APK build failed with exit code $LASTEXITCODE"
  }
}
finally {
  $env:PATROL360_ANDROID_KEYSTORE = $null
  $env:PATROL360_ANDROID_KEY_ALIAS = $null
  $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $null
  $env:PATROL360_ANDROID_KEY_PASSWORD = $null
  $plainPassword = $null
  $securePassword = $null
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}

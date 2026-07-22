param(
  [string]$SecretPath = '',
  [string]$BuildRoot = '',
  [string]$JavaHome = $env:JAVA_HOME,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$PolicyPath = Join-Path $ProjectRoot 'release-signing.json'
$DpapiEntropy = [Text.Encoding]::UTF8.GetBytes('Patrol360.ReleaseSigning.v1')

# Locate the JDK tool used to verify the pinned certificate.
function Get-KeytoolPath {
  param([string]$RequestedJavaHome)
  foreach ($homeCandidate in @($RequestedJavaHome, 'C:\jdk-21.0.2')) {
    if (-not [string]::IsNullOrWhiteSpace($homeCandidate)) {
      $candidate = Join-Path $homeCandidate 'bin\keytool.exe'
      if (Test-Path -LiteralPath $candidate) {
        return $candidate
      }
    }
  }
  throw 'keytool.exe was not found. Set JAVA_HOME to an installed JDK.'
}

function Unprotect-SigningPassword {
  param([Parameter(Mandatory = $true)]$Metadata)

  if ($Metadata.protection -eq 'Windows DPAPI CurrentUser') {
    $securePassword = ConvertTo-SecureString ([string]$Metadata.encryptedPassword)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
      return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
      if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      }
      $securePassword = $null
    }
  }

  if ($Metadata.protection -eq 'Windows DPAPI LocalMachine') {
    $protectedBytes = [Convert]::FromBase64String([string]$Metadata.encryptedPassword)
    try {
      $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes,
        $DpapiEntropy,
        [Security.Cryptography.DataProtectionScope]::LocalMachine
      )
      try {
        return [Text.Encoding]::UTF8.GetString($plainBytes)
      }
      finally {
        if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
      }
    }
    finally {
      [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
    }
  }

  throw ('Unsupported release secret protection: {0}' -f $Metadata.protection)
}

function Get-CertificateSha256 {
  param([string]$Keytool, [string]$KeystorePath, [string]$Alias)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Keytool -list -v -keystore $KeystorePath -alias $Alias -storepass:env PATROL360_ANDROID_KEYSTORE_PASSWORD 2>&1
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'keytool could not read the requested alias.'
  }

  $pattern = 'SHA256:\s*(?<hash>(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})'
  $match = [Regex]::Match(($output -join [Environment]::NewLine), $pattern)
  if (-not $match.Success) {
    throw 'keytool did not return a SHA-256 certificate digest.'
  }
  return $match.Groups['hash'].Value.Replace(':', '').ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $PolicyPath)) {
  throw ('Release signing policy not found: {0}' -f $PolicyPath)
}

$policy = Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedHash = ([string]$policy.certificateSha256).Replace(':', '').ToLowerInvariant()
if ($expectedHash -notmatch '^[0-9a-f]{64}$') {
  throw ('Invalid certificateSha256 in {0}' -f $PolicyPath)
}

if (-not [string]::IsNullOrWhiteSpace($SecretPath)) {
  $candidatePaths = @($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretPath))
}
else {
  $candidatePaths = @(
    $policy.preferredMetadataFiles |
      ForEach-Object { Join-Path $ProjectRoot ('secrets\{0}' -f $_) }
  )
  $candidatePaths += Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'secrets') -Filter '*.dpapi.json' -File -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName
  $candidatePaths = @($candidatePaths | Select-Object -Unique)
}

if ($candidatePaths.Count -eq 0) {
  throw 'No release signing metadata was found.'
}

$keytool = Get-KeytoolPath -RequestedJavaHome $JavaHome
$selectedMetadata = $null
$selectedPath = $null
$selectedPassword = $null
$candidateErrors = [Collections.Generic.List[string]]::new()

try {
  foreach ($candidatePath in $candidatePaths) {
    try {
      if (-not (Test-Path -LiteralPath $candidatePath)) { throw 'file not found' }
      $metadata = Get-Content -LiteralPath $candidatePath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ([string]$metadata.alias -ne [string]$policy.keyAlias) {
        throw 'alias differs from release-signing.json'
      }
      if (-not (Test-Path -LiteralPath ([string]$metadata.keystorePath))) {
        throw 'referenced keystore is missing'
      }

      $plainPassword = Unprotect-SigningPassword -Metadata $metadata
      $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $plainPassword
      $actualHash = Get-CertificateSha256 -Keytool $keytool -KeystorePath ([string]$metadata.keystorePath) -Alias ([string]$metadata.alias)
      if ($actualHash -ne $expectedHash) {
        throw 'certificate differs from release-signing.json'
      }

      $selectedMetadata = $metadata
      $selectedPath = $candidatePath
      $selectedPassword = $plainPassword
      $plainPassword = $null
      break
    }
    catch {
      $candidateErrors.Add(('{0}: {1}' -f (Split-Path $candidatePath -Leaf), $_.Exception.Message))
      $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $null
      $plainPassword = $null
    }
  }

  if (-not $selectedMetadata) {
    throw ('No usable metadata for the pinned release certificate was found.{0}{1}' -f [Environment]::NewLine, ($candidateErrors -join [Environment]::NewLine))
  }

  $env:PATROL360_ANDROID_KEYSTORE = [string]$selectedMetadata.keystorePath
  $env:PATROL360_ANDROID_KEY_ALIAS = [string]$selectedMetadata.alias
  $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $selectedPassword
  $env:PATROL360_ANDROID_KEY_PASSWORD = $selectedPassword

  Write-Host ('Release signing metadata: {0}' -f $selectedPath)
  Write-Host ('Pinned certificate SHA-256: {0}' -f $expectedHash)

  if ($ValidateOnly) {
    Write-Host 'Release signing validation passed. APK build was not started.'
  }
  else {
    $arguments = @{ Configuration = 'Release' }
    if (-not [string]::IsNullOrWhiteSpace($BuildRoot)) {
      $arguments.BuildRoot = $BuildRoot
    }
    & (Join-Path $PSScriptRoot 'build-apk.ps1') @arguments
    if ($LASTEXITCODE -ne 0) {
      throw ('Release APK build failed with exit code {0}' -f $LASTEXITCODE)
    }
  }
}
finally {
  $env:PATROL360_ANDROID_KEYSTORE = $null
  $env:PATROL360_ANDROID_KEY_ALIAS = $null
  $env:PATROL360_ANDROID_KEYSTORE_PASSWORD = $null
  $env:PATROL360_ANDROID_KEY_PASSWORD = $null
  $selectedPassword = $null
  $plainPassword = $null
  [Array]::Clear($DpapiEntropy, 0, $DpapiEntropy.Length)
}

param(
  [string]$KeystorePath = (Join-Path (Split-Path $PSScriptRoot -Parent) "secrets\patrol360-release.jks"),
  [string]$SecretPath = (Join-Path (Split-Path $PSScriptRoot -Parent) "secrets\patrol360-release.dpapi.json"),
  [string]$Alias = "patrol360-release",
  [string]$JavaHome = $env:JAVA_HOME,
  [switch]$AllowCertificateRotation
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($JavaHome)) {
  $JavaHome = "C:\jdk-21.0.2"
}

$keytool = Join-Path $JavaHome "bin\keytool.exe"
if (-not (Test-Path -LiteralPath $keytool)) {
  throw "keytool not found: $keytool"
}

$signingPolicyPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'release-signing.json'
if ((Test-Path -LiteralPath $signingPolicyPath) -and -not $AllowCertificateRotation) {
  throw 'A release certificate is already pinned. Restore the existing JKS; a new key would make Android updates incompatible. Use -AllowCertificateRotation only for an approved rotation.'
}

if ((Test-Path -LiteralPath $KeystorePath) -or (Test-Path -LiteralPath $SecretPath)) {
  throw "Release signing material already exists. Refusing to overwrite it."
}

$secretDirectory = Split-Path $SecretPath -Parent
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null

$passwordBytes = New-Object byte[] 36
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($passwordBytes)
$plainPassword = [Convert]::ToBase64String($passwordBytes).Replace("+", "A").Replace("/", "B").TrimEnd("=")
$securePassword = ConvertTo-SecureString $plainPassword -AsPlainText -Force
$encryptedPassword = ConvertFrom-SecureString $securePassword

try {
  & $keytool `
    -genkeypair `
    -v `
    -keystore $KeystorePath `
    -storetype JKS `
    -storepass $plainPassword `
    -keypass $plainPassword `
    -alias $Alias `
    -keyalg RSA `
    -keysize 4096 `
    -sigalg SHA256withRSA `
    -validity 10000 `
    -dname "CN=Patrol360 Release, OU=Mobile, O=Atom Minerals, L=Yekaterinburg, ST=Sverdlovsk Oblast, C=RU"

  if ($LASTEXITCODE -ne 0) {
    throw "keytool failed with exit code $LASTEXITCODE"
  }

  $metadata = [ordered]@{
    version = 1
    keystorePath = $KeystorePath
    alias = $Alias
    encryptedPassword = $encryptedPassword
    protection = "Windows DPAPI CurrentUser"
    createdAt = [DateTimeOffset]::Now.ToString("O")
  } | ConvertTo-Json

  [IO.File]::WriteAllText($SecretPath, $metadata, [Text.UTF8Encoding]::new($false))
  Write-Host "Release keystore created: $KeystorePath"
  Write-Host "Encrypted signing metadata created: $SecretPath"
}
catch {
  Remove-Item -LiteralPath $KeystorePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SecretPath -Force -ErrorAction SilentlyContinue
  throw
}
finally {
  if ($passwordBytes) {
    [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
  }
  if ($random) {
    $random.Dispose()
  }
  $plainPassword = $null
  $securePassword = $null
}

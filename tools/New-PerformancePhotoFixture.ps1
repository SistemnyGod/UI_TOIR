param(
  [Parameter(Mandatory = $true)] [string]$Path,
  [int]$SizeBytes = 1048576
)

$ErrorActionPreference = "Stop"
if ($SizeBytes -ne 1048576) {
  throw "The standard recovery scenario requires an exactly 1 MiB photo fixture."
}
$destination = [IO.Path]::GetFullPath($Path)
$directory = Split-Path -Parent $destination
if ([string]::IsNullOrWhiteSpace($directory)) { throw "Path must include a directory." }
New-Item -ItemType Directory -Force -Path $directory | Out-Null

$bytes = New-Object byte[] $SizeBytes
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[IO.File]::WriteAllBytes($destination, $bytes)
[pscustomobject]@{
  path = $destination
  sizeBytes = (Get-Item -LiteralPath $destination).Length
  sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json

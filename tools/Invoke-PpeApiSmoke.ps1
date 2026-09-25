param(
  [string]$DatabaseHost = "127.0.0.1",
  [int]$DatabasePort = 55439,
  [string]$DatabaseName = "patrol360_ppe_test",
  [string]$DatabaseUser = "postgres",
  [Parameter(Mandatory = $true)][string]$DatabasePassword,
  [Parameter(Mandatory = $true)][string]$BootstrapPassword,
  [Parameter(Mandatory = $true)][string]$ChangedPassword,
  [int]$ApiPort = 5289,
  [switch]$KeepApiRunning
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputDir = Join-Path $repoRoot "output\ppe-api-smoke"
$fixturePath = Join-Path $outputDir "fixture.json"
$reportPath = Join-Path $outputDir "report.json"
$apiLog = Join-Path $outputDir "api.log"

if ($DatabaseHost -notin @("127.0.0.1", "localhost") -or $DatabasePort -ne 55439 -or $DatabaseName -ne "patrol360_ppe_test") {
  throw "Guard rejected database target. Only 127.0.0.1:55439/patrol360_ppe_test is allowed."
}
if ($ApiPort -lt 1024 -or $ApiPort -eq 5432 -or $ApiPort -eq 55439) { throw "Guard rejected API port." }
if ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq $ApiPort) {
  throw "API port $ApiPort is already in use. Stop only your previous test API before running the smoke again."
}
if ($BootstrapPassword -eq $ChangedPassword) { throw "Use distinct test bootstrap and changed passwords." }
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$connection = "Host=$DatabaseHost;Port=$DatabasePort;Database=$DatabaseName;Username=$DatabaseUser;Password=$DatabasePassword;Include Error Detail=false"
$baseUrl = "http://127.0.0.1:$ApiPort"
$apiProcess = $null
$environmentNames = @('ConnectionStrings__Patrol360','Patrol360__BootstrapAdminPassword','Patrol360__SeedDemoData','Features__PpeIssueDocuments','ASPNETCORE_ENVIRONMENT','ASPNETCORE_URLS','PATROL360_PPE_SMOKE_CONNECTION','PATROL360_PPE_SMOKE_FIXTURE')
$previousEnvironment = @{}
foreach ($environmentName in $environmentNames) { $previousEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, 'Process') }

function Invoke-CheckedJson([string]$Method, [string]$Path, $Body, [string]$Token = "") {
  $headers = @{}; if ($Token) { $headers.Authorization = "Bearer $Token" }
  $parameters = @{ Method = $Method; Uri = "$baseUrl$Path"; Headers = $headers }
  if ($null -ne $Body) { $parameters.ContentType = "application/json"; $parameters.Body = ($Body | ConvertTo-Json -Depth 12) }
  Invoke-RestMethod @parameters
}

try {
  Push-Location $repoRoot
  $env:ConnectionStrings__Patrol360 = $connection
  $env:Patrol360__BootstrapAdminPassword = $BootstrapPassword
  $env:Patrol360__SeedDemoData = "false"
  $env:Features__PpeIssueDocuments = "true"
  $env:ASPNETCORE_ENVIRONMENT = "Development"
  $env:ASPNETCORE_URLS = $baseUrl

  & dotnet build apps/api/Patrol360.Api.csproj --no-restore -m:1 --disable-build-servers
  if ($LASTEXITCODE -ne 0) { throw "API build failed." }
  & dotnet run --project apps/api/Patrol360.Api.csproj --no-build -- --migrate
  if ($LASTEXITCODE -ne 0) { throw "Isolated database migration failed." }

  $env:PATROL360_PPE_SMOKE_CONNECTION = $connection
  $env:PATROL360_PPE_SMOKE_FIXTURE = $fixturePath
  & dotnet run --project tools/PpeSmokeFixture/PpeSmokeFixture.csproj --disable-build-servers
  if ($LASTEXITCODE -ne 0) { throw "Synthetic fixture seed failed." }
  $fixture = Get-Content -Raw $fixturePath | ConvertFrom-Json

  $apiDll = Join-Path $repoRoot "apps\api\bin\Debug\net10.0\Patrol360.Api.dll"
  $apiProcess = Start-Process dotnet -ArgumentList ('"' + $apiDll + '"') -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiLog -RedirectStandardError (Join-Path $outputDir "api-error.log")
  $deadline = (Get-Date).AddSeconds(45)
  do { try { Invoke-RestMethod "$baseUrl/health/live" | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } } while ((Get-Date) -lt $deadline)
  if ($apiProcess.HasExited) { throw "API exited before smoke checks. See $apiLog" }

  try {
    $login = Invoke-CheckedJson POST "/api/v1/auth/login" @{ login = "admin"; password = $BootstrapPassword; rememberMe = $false }
  }
  catch {
    $existing = Invoke-CheckedJson POST "/api/v1/auth/login" @{ login = "admin"; password = $ChangedPassword; rememberMe = $false }
    $login = Invoke-CheckedJson POST "/api/v1/auth/change-password" @{ currentPassword = $ChangedPassword; newPassword = $BootstrapPassword; confirmPassword = $BootstrapPassword } $existing.accessToken
  }
  $changed = Invoke-CheckedJson POST "/api/v1/auth/change-password" @{ currentPassword = $BootstrapPassword; newPassword = $ChangedPassword; confirmPassword = $ChangedPassword } $login.accessToken
  $token = $changed.accessToken
  $capabilities = Invoke-CheckedJson GET "/api/v1/inventory/ppe/issue-documents/capabilities" $null $token
  if (-not $capabilities.enabled) { throw "PPE issue documents feature is disabled." }

  $today = Get-Date -Format "yyyy-MM-dd"
  $lineId = [guid]::NewGuid().ToString()
  $draftBody = @{ employeeId=$fixture.employeeId; normSetId=$fixture.normId; documentDate=$today; responsibleName="Синтетический ответственный"; basis="HTTP smoke"; employeeDetails=@{}; lines=@(@{ id=$lineId; normRowId=$fixture.rowId; itemId=$fixture.itemId; issueDate=$today; quantity=1; unitPriceMinor=12345; sizeText="58"; exceptionReason=""; manualControlConfirmed=$false }) }
  $draft = Invoke-CheckedJson POST "/api/v1/inventory/ppe/issue-documents" $draftBody $token
  $validated = Invoke-CheckedJson POST "/api/v1/inventory/ppe/issue-documents/$($draft.id)/validate" @{} $token

  $previewPath = Join-Path $outputDir "issue-preview.docx"
  Invoke-WebRequest "$baseUrl/api/v1/inventory/ppe/issue-documents/$($draft.id)/print?type=norms&format=docx" -Headers @{ Authorization="Bearer $token" } -OutFile $previewPath
  $idempotencyKey = "ppe-smoke-$($draft.id)"
  $confirmed = Invoke-CheckedJson POST "/api/v1/inventory/ppe/issue-documents/$($draft.id)/confirm" @{ expectedVersion=$validated.version; idempotencyKey=$idempotencyKey } $token
  $repeated = Invoke-CheckedJson POST "/api/v1/inventory/ppe/issue-documents/$($draft.id)/confirm" @{ expectedVersion=$validated.version; idempotencyKey=$idempotencyKey } $token
  $reopened = Invoke-CheckedJson GET "/api/v1/inventory/ppe/issue-documents/$($draft.id)" $null $token
  $history = Invoke-CheckedJson GET "/api/v1/inventory/ppe/issue-documents?employeeId=$($fixture.employeeId)" $null $token
  $legacyPath = Join-Path $outputDir "legacy-card.docx"
  Invoke-WebRequest "$baseUrl/api/v1/inventory/ppe/cards/$($fixture.cardId)/print?format=docx" -Headers @{ Authorization="Bearer $token" } -OutFile $legacyPath

  if ($confirmed.id -ne $repeated.id -or $confirmed.version -ne $repeated.version) { throw "Idempotent confirm returned different documents or versions." }
  if ($reopened.status -ne "confirmed" -or @($history).Count -lt 1) { throw "Reopen/history verification failed." }
  if ((Get-Item $previewPath).Length -lt 1000 -or (Get-Item $legacyPath).Length -lt 1000) { throw "DOCX output is unexpectedly small." }
  $report = [ordered]@{ succeeded=$true; generatedAt=(Get-Date).ToString("o"); baseUrl=$baseUrl; login="admin"; fixture=$fixture; documentId=$draft.id; confirmedVersion=$confirmed.version; historyCount=@($history).Count; issuePreviewDocx=$previewPath; legacyCardDocx=$legacyPath; apiLog=$apiLog }
  $report | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $reportPath
  Write-Host "PPE API smoke passed. Report: $reportPath"
  Write-Host "API URL: $baseUrl"
}
finally {
  if ($apiProcess -and -not $KeepApiRunning -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id }
  Pop-Location
  foreach ($environmentName in $environmentNames) { [Environment]::SetEnvironmentVariable($environmentName, $previousEnvironment[$environmentName], 'Process') }
}

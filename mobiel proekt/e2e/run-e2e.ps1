<#
.SYNOPSIS
  Runs the Patrol360 Maestro e2e flows against the local mock backend on an Android emulator.

.DESCRIPTION
  1. Starts e2e/mock-server/server.mjs on the host (port 18360; the emulator reaches it as 10.0.2.2).
  2. Optionally installs the e2e debug APK (built with -Patrol360Environment e2e, see README).
  3. Runs the flows in order. Between flows it toggles the emulator network with adb
     (airplane mode + wifi + mobile data), because Maestro cannot cut the network reliably.
  4. After the last flow it asks the mock whether the report really arrived.

  Never point this at a real server: the e2e build only allows PATROL360_PUBLIC_API_URL.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File e2e\run-e2e.ps1 -Device emulator-5556 -Apk build-output-e2e\patrol360-mobile-debug.apk
#>
param(
  # adb serial of the emulator. Use a dedicated emulator: the flows wipe app data and cut its network.
  [string]$Device = "emulator-5556",

  # APK to (re)install before the run. Omit to keep what is installed.
  [string]$Apk = "",

  # Mock backend port on the host. Must match PATROL360_PUBLIC_API_URL baked into the APK.
  [int]$Port = 18360,

  # Run only these flow file names (for example "01-login.yaml"). Default: all, in order.
  [string[]]$Only = @(),

  [string]$AndroidSdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }),

  [string]$Maestro = $(if ($env:MAESTRO_BIN) { $env:MAESTRO_BIN } else { Join-Path $env:USERPROFILE ".maestro\maestro\bin\maestro.bat" }),

  [string]$ReportDir = ""
)

$ErrorActionPreference = "Stop"
$E2eRoot = $PSScriptRoot
$FlowDir = Join-Path $E2eRoot "flows"
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
if ([string]::IsNullOrWhiteSpace($ReportDir)) { $ReportDir = Join-Path $E2eRoot "reports" }
$MockUrl = "http://127.0.0.1:$Port"
$AppId = "ru.patrol360.mobile"

$env:MAESTRO_CLI_NO_ANALYTICS = "1"
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = "true"

foreach ($tool in @($Adb, $Maestro)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "Not found: $tool (see e2e/README.md, Setup)" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node is required for the mock backend" }

# Windows PowerShell 5.1 turns native stderr into terminating errors under
# ErrorActionPreference=Stop, and adb prints harmless notices there.
function Invoke-Native {
  param([string]$FilePath, [string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { $output = & $FilePath @Arguments 2>&1 | ForEach-Object { "$_" } }
  finally { $ErrorActionPreference = $previous }
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}

function Invoke-Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AdbArgs)
  $result = Invoke-Native $Adb (@("-s", $Device) + $AdbArgs)
  if ($result.ExitCode -ne 0) { throw "adb $($AdbArgs -join ' ') failed: $($result.Output)" }
  $result.Output
}

function Set-DeviceNetwork {
  param([bool]$Online)
  if ($Online) {
    Invoke-Adb shell cmd connectivity airplane-mode disable | Out-Null
    Invoke-Adb shell svc wifi enable | Out-Null
    Invoke-Adb shell svc data enable | Out-Null
  } else {
    Invoke-Adb shell svc wifi disable | Out-Null
    Invoke-Adb shell svc data disable | Out-Null
    Invoke-Adb shell cmd connectivity airplane-mode enable | Out-Null
  }
  # Give NetInfo time to publish the change to the app.
  Start-Sleep -Seconds 3
  Write-Host ("Device network: " + $(if ($Online) { "ONLINE" } else { "OFFLINE" }))
}

function Invoke-Mock {
  param([string]$Path, [string]$Method = "GET")
  Invoke-RestMethod -Uri "$MockUrl$Path" -Method $Method -TimeoutSec 5
}

# --- device ---------------------------------------------------------------
Invoke-Native $Adb @("start-server") | Out-Null
$state = (Invoke-Native $Adb @("-s", $Device, "get-state")).Output
if ("$state".Trim() -ne "device") { throw "Device $Device is not ready (adb get-state: $state). Start the emulator first (README)." }
if ((Invoke-Adb shell getprop sys.boot_completed).Trim() -ne "1") { throw "Device $Device has not finished booting." }

if ($Apk) {
  $apkPath = (Resolve-Path -LiteralPath $Apk).Path
  Write-Host "Reinstalling $apkPath on $Device"
  Invoke-Native $Adb @("-s", $Device, "uninstall", $AppId) | Out-Null
  Invoke-Adb install -r -g $apkPath | Out-Null
}
$startsFromLogin = $Only.Count -eq 0 -or $Only -contains "01-login.yaml"
if ($startsFromLogin) {
  # Wipe the app while the network may still be off: a report queued by a
  # previous run would otherwise reach the freshly reset mock as soon as the
  # network returns and complete the seeded request before flow 01 starts.
  Invoke-Adb shell am force-stop $AppId | Out-Null
  Invoke-Adb shell pm clear $AppId | Out-Null
}
Set-DeviceNetwork -Online $true
# Gboard on API 34+ treats Maestro taps as stylus input and opens its
# handwriting onboarding over the form, eating the typed text.
Invoke-Native $Adb @("-s", $Device, "shell", "settings", "put", "secure", "stylus_handwriting_enabled", "0") | Out-Null
# Notifications permission prompt would cover the first screen on API 33+.
Invoke-Native $Adb @("-s", $Device, "shell", "pm", "grant", $AppId, "android.permission.POST_NOTIFICATIONS") | Out-Null
# Background report delivery asks to leave battery optimisation once; pre-approve it.
Invoke-Native $Adb @("-s", $Device, "shell", "dumpsys", "deviceidle", "whitelist", "+$AppId") | Out-Null

# --- mock backend -----------------------------------------------------------
$mockLog = Join-Path $ReportDir "mock-server.log"
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$mock = Start-Process -FilePath "node" -ArgumentList @(('"' + (Join-Path $E2eRoot "mock-server\server.mjs") + '"'), "--port", "$Port") `
  -RedirectStandardOutput $mockLog -RedirectStandardError "$mockLog.err" -PassThru -WindowStyle Hidden
try {
  $ready = $false
  for ($i = 0; $i -lt 40 -and -not $ready; $i++) {
    try { Invoke-Mock "/__e2e/state" | Out-Null; $ready = $true } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw "Mock backend did not start; see $mockLog.err" }
  Invoke-Mock "/__e2e/reset" "POST" | Out-Null
  Write-Host "Mock backend: $MockUrl (device sees http://10.0.2.2:$Port)"

  # --- flows ----------------------------------------------------------------
  # Network state each flow expects before it starts.
  $plan = [ordered]@{
    "01-login.yaml"            = "online"
    "02-start-patrol.yaml"     = "online"
    "03-manual-point-ok.yaml"  = "online"
    "04-faulty-point.yaml"     = "online"
    "05-offline-submit.yaml"   = "offline"
    "06-online-delivered.yaml" = "online"
  }
  $results = [ordered]@{}
  $failed = $false
  foreach ($flow in $plan.Keys) {
    if ($Only.Count -gt 0 -and $Only -notcontains $flow) { continue }
    if ($failed) { $results[$flow] = "SKIPPED"; continue }
    Set-DeviceNetwork -Online ($plan[$flow] -eq "online")
    $flowPath = Join-Path $FlowDir $flow
    $flowOut = Join-Path $ReportDir ([IO.Path]::GetFileNameWithoutExtension($flow))
    Write-Host "`n=== $flow ($($plan[$flow])) ==="
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $Maestro --device $Device test $flowPath --format junit --output "$flowOut.xml" --debug-output $flowOut 2>&1 | ForEach-Object { "$_" } | Write-Host }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { $results[$flow] = "FAILED"; $failed = $true } else { $results[$flow] = "PASSED" }
  }

  # --- server-side check ------------------------------------------------------
  if (-not $failed -and $results.Contains("06-online-delivered.yaml")) {
    $serverState = Invoke-Mock "/__e2e/state"
    if (-not $serverState.reportReceived) { $results["server: report received"] = "FAILED"; $failed = $true }
    else { $results["server: report received"] = "PASSED" }
    $serverState | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $ReportDir "mock-state.json")
  }

  Write-Host "`n=== Summary ==="
  $results.GetEnumerator() | ForEach-Object { Write-Host ("{0,-28} {1}" -f $_.Key, $_.Value) }
  Write-Host "Reports: $ReportDir"
  if ($failed) { exit 1 }
}
finally {
  try { Set-DeviceNetwork -Online $true } catch { Write-Warning "Could not restore device network: $_" }
  if ($mock -and -not $mock.HasExited) { Stop-Process -Id $mock.Id -Force }
}

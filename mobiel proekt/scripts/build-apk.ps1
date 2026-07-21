param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release",

  [string]$BuildRoot = "",

  [string]$AndroidSdk = $env:ANDROID_HOME,

  [string]$JavaHome = "",

  [string]$ReactNativeArchitectures = "arm64-v8a",

  [string]$ReleaseKeystore = $env:PATROL360_ANDROID_KEYSTORE,

  [string]$ReleaseKeyAlias = $env:PATROL360_ANDROID_KEY_ALIAS,

  [switch]$KeepBuildRoot
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $FilePath $($Arguments -join ' ')"
  }
}

function Remove-BuildRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [int]$Retries = 5,

    [switch]$ThrowOnFailure
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  for ($attempt = 1; $attempt -le $Retries; $attempt++) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    }
    catch {
      if ($attempt -eq $Retries) {
        if ($ThrowOnFailure) {
          throw
        }

        Write-Warning "Build root cleanup skipped because files are still locked: $Path"
        return
      }

      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
}

function Set-GradleProperty {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $line = "$Name=$Value"

  if (-not (Test-Path -LiteralPath $Path)) {
    Set-Content -LiteralPath $Path -Value $line
    return
  }

  $content = Get-Content -LiteralPath $Path
  $updated = $false
  $nextContent = foreach ($existingLine in $content) {
    if ($existingLine -match "^\s*$([Regex]::Escape($Name))\s*=") {
      $updated = $true
      $line
    }
    else {
      $existingLine
    }
  }

  if (-not $updated) {
    $nextContent += $line
  }

  Set-Content -LiteralPath $Path -Value $nextContent
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutputDir = Join-Path $ProjectRoot "build-output"

if ([string]::IsNullOrWhiteSpace($BuildRoot)) {
  # Expo's package-refactor glob can fail on Windows paths containing Cyrillic
  # characters. Native CMake paths are even more restrictive, so use a short
  # ASCII directory under the current user's profile instead of C:\p (which
  # may be inaccessible) or the project path.
  $BuildRoot = Join-Path $env:USERPROFILE ".tmp\patrol360"
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
  throw "Project root was not detected from script path: $ProjectRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) {
  throw "node_modules not found. Run npm install in the mobile project first."
}

if ([string]::IsNullOrWhiteSpace($AndroidSdk)) {
  $AndroidSdk = "C:\Users\AI_server\AppData\Local\Android\Sdk"
}

if ([string]::IsNullOrWhiteSpace($JavaHome)) {
  $EnvironmentJavaRelease = if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
    $null
  }
  else {
    Join-Path $env:JAVA_HOME "release"
  }

  if ($EnvironmentJavaRelease -and
    (Test-Path -LiteralPath $EnvironmentJavaRelease) -and
    (Get-Content -LiteralPath $EnvironmentJavaRelease -Raw) -match 'JAVA_VERSION="17(?:\.|\")') {
    $JavaHome = $env:JAVA_HOME
  }

  $GradleJdk17 = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE ".gradle\jdks") -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match "17" -and
      (Test-Path -LiteralPath (Join-Path $_.FullName "bin\java.exe"))
    } |
    Select-Object -First 1

  if ([string]::IsNullOrWhiteSpace($JavaHome) -and $GradleJdk17) {
    $JavaHome = $GradleJdk17.FullName
  }
}

if (-not (Test-Path -LiteralPath $AndroidSdk)) {
  throw "Android SDK not found: $AndroidSdk"
}

if (-not (Test-Path -LiteralPath $JavaHome)) {
  throw "JAVA_HOME not found: $JavaHome"
}

$JavaReleaseFile = Join-Path $JavaHome "release"
if (-not (Test-Path -LiteralPath $JavaReleaseFile) -or
  (Get-Content -LiteralPath $JavaReleaseFile -Raw) -notmatch 'JAVA_VERSION="17(?:\.|\")') {
  throw "Java 17 is required for the Android build. Selected JAVA_HOME: $JavaHome"
}

if ($Configuration -eq "Release") {
  $missingReleaseSigning = [string]::IsNullOrWhiteSpace($ReleaseKeystore) `
    -or -not (Test-Path -LiteralPath $ReleaseKeystore) `
    -or [string]::IsNullOrWhiteSpace($ReleaseKeyAlias) `
    -or [string]::IsNullOrWhiteSpace($env:PATROL360_ANDROID_KEYSTORE_PASSWORD) `
    -or [string]::IsNullOrWhiteSpace($env:PATROL360_ANDROID_KEY_PASSWORD)

  if ($missingReleaseSigning) {
    throw "Release signing is required. Set PATROL360_ANDROID_KEYSTORE, PATROL360_ANDROID_KEY_ALIAS, PATROL360_ANDROID_KEYSTORE_PASSWORD and PATROL360_ANDROID_KEY_PASSWORD."
  }
}

$buildLeaf = Split-Path -Leaf $BuildRoot
if ($buildLeaf -notmatch "patrol360" -or $BuildRoot.Length -lt 10) {
  throw "Refusing to clean unsafe build root: $BuildRoot"
}

if (Test-Path -LiteralPath $BuildRoot) {
  $resolvedBuildRoot = (Resolve-Path -LiteralPath $BuildRoot).Path
  if ($resolvedBuildRoot -ne $BuildRoot) {
    throw "Resolved build root mismatch: $resolvedBuildRoot"
  }
  Remove-BuildRoot -Path $BuildRoot -Retries 8 -ThrowOnFailure
}

$GradleUserHome = Join-Path (Split-Path -Parent $BuildRoot) "gradle-home"
$GradleWrapperDists = Join-Path $GradleUserHome "wrapper\dists"
$HostGradleWrapperDists = Join-Path $env:USERPROFILE ".gradle\wrapper\dists"
$GradleModuleCache = Join-Path $GradleUserHome "caches\modules-2"
$HostGradleModuleCache = Join-Path $env:USERPROFILE ".gradle\caches\modules-2"
$HostGradleBin = Get-ChildItem -Path (Join-Path $HostGradleWrapperDists "gradle-9.3.1-bin") -Recurse -Filter "gradle.bat" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\gradle-9\.3\.1\\bin\\gradle\.bat$" } |
  Select-Object -First 1

New-Item -ItemType Directory -Path $GradleWrapperDists -Force | Out-Null

if (Test-Path -LiteralPath (Join-Path $HostGradleWrapperDists "gradle-9.3.1-bin")) {
  Copy-Item `
    -LiteralPath (Join-Path $HostGradleWrapperDists "gradle-9.3.1-bin") `
    -Destination $GradleWrapperDists `
    -Recurse `
    -Force
}

$LocalGradleBin = Get-ChildItem -Path $GradleWrapperDists -Recurse -Filter "gradle.bat" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\gradle-9\.3\.1\\bin\\gradle\.bat$" } |
  Select-Object -First 1

if ((Test-Path -LiteralPath $HostGradleModuleCache) -and -not (Test-Path -LiteralPath $GradleModuleCache)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $GradleModuleCache) -Force | Out-Null
  robocopy $HostGradleModuleCache $GradleModuleCache /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Gradle module cache copy failed with exit code $LASTEXITCODE"
  }
}

$buildSucceeded = $false

try {
  New-Item -ItemType Directory -Path $BuildRoot | Out-Null
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

  Write-Host "Copying project to stable build path: $BuildRoot"
  robocopy $ProjectRoot $BuildRoot /E /XD .expo .tmp build-output /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed with exit code $LASTEXITCODE"
  }

  Push-Location $BuildRoot
}
catch {
  if ((Test-Path -LiteralPath $BuildRoot) -and -not $KeepBuildRoot) {
    Remove-BuildRoot -Path $BuildRoot
  }
  throw
}

try {
  $env:CI = "1"
  $env:JAVA_HOME = $JavaHome
  $env:ANDROID_HOME = $AndroidSdk
  $env:ANDROID_SDK_ROOT = $AndroidSdk
  $env:GRADLE_USER_HOME = $GradleUserHome
  $env:GRADLE_OPTS = "-Xmx4096m -Dfile.encoding=UTF-8"
  $env:NODE_ENV = if ($Configuration -eq "Release") { "production" } else { "development" }
  $env:Path = "$JavaHome\bin;$AndroidSdk\platform-tools;$env:Path"

  Write-Host "Generating Android project..."
  Invoke-Checked "npx" "expo" "prebuild" "--platform" "android" "--clean" "--no-install"

  if ($Configuration -eq "Debug") {
    # React Native treats the debug variant as a Metro-powered development
    # client by default and does not embed JavaScript. The APK distributed to
    # test phones must be standalone, otherwise TypeScript fixes never reach
    # the installed application when Metro is not running.
    $appBuildGradle = Join-Path $BuildRoot "android\app\build.gradle"
    $appBuildGradleContent = Get-Content -LiteralPath $appBuildGradle -Raw
    if ($appBuildGradleContent -notmatch '(?m)^\s*debuggableVariants\s*=') {
      $appBuildGradleContent = $appBuildGradleContent -replace 'react \{', "react {`r`n    debuggableVariants = []"
      Set-Content -LiteralPath $appBuildGradle -Value $appBuildGradleContent -NoNewline
    }
  }

  $gradlePluginSettings = Join-Path $BuildRoot "node_modules\@react-native\gradle-plugin\settings.gradle.kts"
  if (Test-Path -LiteralPath $gradlePluginSettings) {
    $settingsContent = Get-Content -LiteralPath $gradlePluginSettings -Raw
    # JAVA_HOME is pinned above, so the optional Foojay toolchain resolver is
    # not required for this build. Removing its plugin marker keeps local and
    # restricted-network builds independent of Gradle Plugin Portal metadata.
    $settingsContent = $settingsContent -replace '(?m)^\s*plugins\s*\{\s*id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)\.version\("[^"]+"\)\s*\}\s*$', ''
    Set-Content -LiteralPath $gradlePluginSettings -Value $settingsContent -NoNewline
  }

  $localProperties = Join-Path $BuildRoot "android\local.properties"
  $escapedSdk = $AndroidSdk.Replace('\', '\\').Replace(':', '\:')
  Set-Content -LiteralPath $localProperties -Value "sdk.dir=$escapedSdk" -NoNewline

  $gradleProperties = Join-Path $BuildRoot "android\gradle.properties"
  Set-GradleProperty -Path $gradleProperties -Name "org.gradle.jvmargs" -Value "-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8"
  Set-GradleProperty -Path $gradleProperties -Name "org.gradle.workers.max" -Value "2"

  Push-Location (Join-Path $BuildRoot "android")
  try {
    $task = if ($Configuration -eq "Release") { "assembleRelease" } else { "assembleDebug" }
    Write-Host "Running Gradle task: $task"
    if ($LocalGradleBin) {
      Invoke-Checked $LocalGradleBin.FullName $task "--no-daemon" "--console=plain" "-PreactNativeArchitectures=$ReactNativeArchitectures"
    }
    elseif ($HostGradleBin) {
      Invoke-Checked $HostGradleBin.FullName $task "--no-daemon" "--console=plain" "-PreactNativeArchitectures=$ReactNativeArchitectures"
    }
    else {
      Invoke-Checked ".\gradlew.bat" $task "--no-daemon" "--console=plain" "-PreactNativeArchitectures=$ReactNativeArchitectures"
    }
  }
  finally {
    Pop-Location
  }

  $apkFolder = Join-Path $BuildRoot "android\app\build\outputs\apk\$($Configuration.ToLowerInvariant())"
  $apk = Get-ChildItem -LiteralPath $apkFolder -Filter "*.apk" | Select-Object -First 1
  if (-not $apk) {
    throw "APK was not produced in $apkFolder"
  }

  $destName = if ($Configuration -eq "Release") { "patrol360-mobile-release.apk" } else { "patrol360-mobile-debug.apk" }
  $destPath = Join-Path $OutputDir $destName

  if ($Configuration -eq "Release") {
    $buildToolsRoot = Join-Path $AndroidSdk "build-tools"
    $buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory |
      Sort-Object { [version]$_.Name } -Descending |
      Select-Object -First 1
    if (-not $buildTools) {
      throw "Android build-tools not found under $buildToolsRoot"
    }

    $zipAlign = Join-Path $buildTools.FullName "zipalign.exe"
    $apkSigner = Join-Path $buildTools.FullName "apksigner.bat"
    if (-not (Test-Path -LiteralPath $zipAlign) -or -not (Test-Path -LiteralPath $apkSigner)) {
      throw "zipalign or apksigner is missing from $($buildTools.FullName)"
    }

    $alignedPath = Join-Path $OutputDir "patrol360-mobile-release-aligned.apk"
    try {
      Invoke-Checked $zipAlign "-f" "-p" "4" $apk.FullName $alignedPath
      Invoke-Checked $apkSigner "sign" "--ks" $ReleaseKeystore "--ks-key-alias" $ReleaseKeyAlias "--ks-pass" "env:PATROL360_ANDROID_KEYSTORE_PASSWORD" "--key-pass" "env:PATROL360_ANDROID_KEY_PASSWORD" "--out" $destPath $alignedPath
      Invoke-Checked $apkSigner "verify" "--verbose" $destPath
    }
    finally {
      Remove-Item -LiteralPath $alignedPath -Force -ErrorAction SilentlyContinue
    }
  }
  else {
    Copy-Item -LiteralPath $apk.FullName -Destination $destPath -Force
  }

  $result = Get-Item -LiteralPath $destPath
  Write-Host "APK ready: $($result.FullName)"
  Write-Host "Size: $([Math]::Round($result.Length / 1MB, 1)) MB"
  $buildSucceeded = $true
}
finally {
  Pop-Location
  if ($buildSucceeded -and -not $KeepBuildRoot -and (Test-Path -LiteralPath $BuildRoot)) {
    $gradlew = Join-Path $BuildRoot "android\gradlew.bat"
    if (Test-Path -LiteralPath $gradlew) {
      & $gradlew "--stop" "--quiet" | Out-Null
    }

    Remove-BuildRoot -Path $BuildRoot
  }
}

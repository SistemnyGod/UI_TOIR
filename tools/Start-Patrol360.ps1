param(
  [switch]$SkipWebBuild,
  [switch]$SkipServiceBuild,
  [switch]$NoCache,
  [switch]$SkipHealthWait,
  [int]$HealthTimeoutSeconds = 180,
  [string]$LanHost = "192.168.2.194"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeBaseArgs = @(
  "compose",
  "-f",
  "compose.yaml",
  "-f",
  "infra/docker/compose.web-prebuilt.yaml"
)
$composeArgs = $composeBaseArgs + @("--profile", "app")

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  & $Action
  $timer.Stop()
  Write-Host "OK: $Title ($([Math]::Round($timer.Elapsed.TotalSeconds, 1))s)" -ForegroundColor Green
}

function Test-RequiredCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Get-ContainerState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $format = "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"
  $value = & docker inspect -f $format $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
    return [pscustomobject]@{
      Name = $Name
      Exists = $false
      Status = "missing"
      Health = "missing"
      Ready = $false
    }
  }

  $parts = $value -split "\|", 2
  $status = $parts[0]
  $health = if ($parts.Length -gt 1) { $parts[1] } else { "none" }
  $ready = $status -eq "running" -and ($health -eq "healthy" -or $health -eq "none")

  [pscustomobject]@{
    Name = $Name
    Exists = $true
    Status = $status
    Health = $health
    Ready = $ready
  }
}

function Wait-ForContainers {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Names,

    [Parameter(Mandatory = $true)]
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $states = @($Names | ForEach-Object { Get-ContainerState $_ })
    $notReady = @($states | Where-Object { -not $_.Ready })

    if ($notReady.Count -eq 0) {
      return $states
    }

    $summary = ($notReady | ForEach-Object { "$($_.Name):$($_.Status)/$($_.Health)" }) -join ", "
    Write-Host "Waiting for containers: $summary"
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  $finalStates = @($Names | ForEach-Object { Get-ContainerState $_ })
  $failed = ($finalStates | Where-Object { -not $_.Ready } | ForEach-Object { "$($_.Name):$($_.Status)/$($_.Health)" }) -join ", "
  throw "Containers did not become ready in $TimeoutSeconds seconds: $failed"
}

Push-Location $repoRoot
try {
  Test-RequiredCommand npm
  Test-RequiredCommand docker
  Invoke-Native docker compose version | Out-Null

  & docker network inspect docker_default *> $null
  if ($LASTEXITCODE -eq 0) {
    $composeArgs = $composeBaseArgs + @(
      "-f",
      "infra/docker/compose.existing-network.yaml",
      "--profile",
      "app"
    )
    Write-Host "Using existing Docker network: docker_default"
  }

  if (-not $SkipWebBuild) {
    Invoke-Step "Build fresh web assets" {
      Invoke-Native npm run build --prefix "apps\web"
    }
  }
  else {
    Write-Host "Skipping npm web build by request." -ForegroundColor Yellow
  }

  $distIndex = Join-Path $repoRoot "apps\web\dist\index.html"
  if (-not (Test-Path $distIndex)) {
    throw "apps\web\dist\index.html was not found. Run without -SkipWebBuild first."
  }

  $distInfo = Get-Item $distIndex
  Write-Host "Web dist index: $($distInfo.FullName)"
  Write-Host "Web dist timestamp: $($distInfo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))"

  Invoke-Step "Build prebuilt web Docker image from local dist" {
    $buildArgs = $composeArgs + @("build")
    if ($NoCache) {
      $buildArgs += "--no-cache"
    }
    $buildArgs += "web"
    Invoke-Native docker @buildArgs
  }

  Invoke-Step "Start Patrol360 Docker stack" {
    $upArgs = $composeArgs + @("up", "-d")
    if (-not $SkipServiceBuild) {
      $upArgs += "--build"
    }
    Invoke-Native docker @upArgs
  }

  if (-not $SkipHealthWait) {
    Invoke-Step "Wait for core containers" {
      $requiredContainers = @(
        "patrol360-postgres",
        "patrol360-api",
        "patrol360-web",
        "patrol360-proxy"
      )
      $states = Wait-ForContainers -Names $requiredContainers -TimeoutSeconds $HealthTimeoutSeconds
      $states | Format-Table Name, Status, Health, Ready -AutoSize | Out-String | Write-Host
    }

    Invoke-Step "Refresh proxy after API health" {
      # API is recreated during a deployment while the long-lived proxy may
      # retain a stale Docker DNS resolution for the old API container. Recreate
      # only the proxy after API health is confirmed so the first browser load
      # cannot receive a transient 502 from `lookup api: i/o timeout`.
      $proxyArgs = $composeArgs + @("up", "-d", "--no-deps", "--force-recreate", "proxy")
      Invoke-Native docker @proxyArgs
      $proxyStates = Wait-ForContainers -Names @("patrol360-proxy") -TimeoutSeconds $HealthTimeoutSeconds
      $proxyStates | Format-Table Name, Status, Health, Ready -AutoSize | Out-String | Write-Host
    }
  }
  else {
    Write-Host "Skipping container health wait by request." -ForegroundColor Yellow
  }

  Invoke-Step "Verify web entrypoint through proxy" {
    # Port 5173 deliberately redirects localhost to the canonical LAN host.
    # Verify the canonical endpoint directly so PowerShell 5 does not turn the
    # expected 308 response into a failed deployment.
    $response = Invoke-WebRequest -Uri "http://${LanHost}:5173/" -UseBasicParsing -TimeoutSec 20
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
      throw "Unexpected HTTP status from proxy: $($response.StatusCode)"
    }
    if ($response.Content -notmatch "/assets/") {
      throw "Proxy response does not look like a built Vite index.html."
    }
  }

  Write-Host ""
  Write-Host "Patrol360 is running with fresh web assets." -ForegroundColor Green
  Write-Host "Local redirect: http://127.0.0.1:5173/"
  Write-Host "LAN:   http://$LanHost`:5173/"
  Write-Host "If the browser still shows old UI, hard refresh the page once."
}
finally {
  Pop-Location
}

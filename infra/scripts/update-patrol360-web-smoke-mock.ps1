[CmdletBinding()]
param(
    [string]$CanonicalUrl = "http://192.168.2.194:5173/",
    [switch]$SkipNpmBuild
)

$ErrorActionPreference = "Stop"

function Get-ContainerId {
    param([Parameter(Mandatory = $true)][string]$Name)

    try {
        $id = docker inspect --format "{{.Id}}" $Name 2>$null
    }
    catch {
        return ""
    }
    if ($LASTEXITCODE -ne 0) {
        return ""
    }

    return $id.Trim()
}

function Get-ContainerHealth {
    param([Parameter(Mandatory = $true)][string]$Name)

    $health = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $Name
    if ($LASTEXITCODE -ne 0) {
        throw "Container '$Name' was not found."
    }

    return $health.Trim()
}

function Wait-Healthy {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$Attempts = 24,
        [int]$DelaySeconds = 2
    )

    for ($i = 1; $i -le $Attempts; $i++) {
        $health = Get-ContainerHealth -Name $Name
        if ($health -eq "healthy" -or $health -eq "running") {
            return
        }

        Start-Sleep -Seconds $DelaySeconds
    }

    throw "Container '$Name' did not become healthy."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$composeArgs = @(
    "-f", "compose.yaml",
    "-f", "infra\docker\compose.web-prebuilt.yaml",
    "-f", "infra\docker\compose.web-smoke-mock.yaml",
    "-f", "infra\docker\compose.existing-network.yaml",
    "--profile", "app"
)

$apiBefore = Get-ContainerId -Name "patrol360-api"
$postgresBefore = Get-ContainerId -Name "patrol360-postgres"

$webConfig = docker compose @composeArgs config web
if ($webConfig -match "depends_on:") {
    throw "web smoke mock config still contains depends_on. Refusing web-only update."
}

if (-not $SkipNpmBuild) {
    npm run build --prefix apps\web
}

docker compose @composeArgs build web
if ($LASTEXITCODE -ne 0) {
    throw "Web image build failed."
}
docker compose @composeArgs up -d --no-deps web
if ($LASTEXITCODE -ne 0) {
    throw "Web container update failed."
}

Wait-Healthy -Name "patrol360-web"

$apiAfter = Get-ContainerId -Name "patrol360-api"
$postgresAfter = Get-ContainerId -Name "patrol360-postgres"

if ($apiBefore -and $apiAfter -and $apiBefore -ne $apiAfter) {
    throw "patrol360-api container changed during web smoke mock update."
}

if ($postgresBefore -and $postgresAfter -and $postgresBefore -ne $postgresAfter) {
    throw "patrol360-postgres container changed during web smoke mock update."
}

$response = Invoke-WebRequest -UseBasicParsing -Uri $CanonicalUrl
if ($response.StatusCode -ne 200) {
    throw "Canonical URL returned HTTP $($response.StatusCode): $CanonicalUrl"
}

$webImage = docker inspect docker-web:latest --format "{{.Id}} {{.Created}}"

Write-Host "Patrol360 web smoke mock update completed."
Write-Host "Canonical URL: $CanonicalUrl"
Write-Host "docker-web:latest $webImage"
Write-Host "patrol360-web health: $(Get-ContainerHealth -Name 'patrol360-web')"
Write-Host "Runtime env: /srv/patrol360-runtime-env.js is mounted from infra/docker/patrol360-runtime-env.mock.js"
Write-Host "patrol360-api unchanged: $($apiBefore -eq $apiAfter)"
Write-Host "patrol360-postgres unchanged: $($postgresBefore -eq $postgresAfter)"

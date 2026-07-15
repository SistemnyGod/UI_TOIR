[CmdletBinding()]
param(
    [string]$CanonicalUrl = "http://192.168.2.194:5173/",
    [switch]$SkipNpmBuild
)

$ErrorActionPreference = "Stop"

function Get-ContainerId {
    param([Parameter(Mandatory = $true)][string]$Name)

    $id = docker inspect --format "{{.Id}}" $Name 2>$null
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

function Merge-PreviousWebAssets {
    param(
        [Parameter(Mandatory = $true)][string]$ContainerName,
        [Parameter(Mandatory = $true)][string]$DistPath
    )

    $assetsPath = Join-Path $DistPath "assets"
    if (-not (Test-Path $assetsPath)) {
        throw "Fresh web build does not contain an assets directory: $assetsPath"
    }

    # Record the fresh generation before merging compatibility assets. The next
    # deployment will retain exactly this generation, avoiding unbounded growth.
    $currentAssets = @(Get-ChildItem -LiteralPath $assetsPath -File | Select-Object -ExpandProperty Name)
    $manifestPath = Join-Path $DistPath "patrol360-assets-current.txt"
    Set-Content -LiteralPath $manifestPath -Value $currentAssets -Encoding utf8

    if (-not (Get-ContainerId -Name $ContainerName)) {
        Write-Host "No running $ContainerName container; previous assets will not be retained."
        return
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("patrol360-web-assets-" + [guid]::NewGuid().ToString("N"))
    $previousAssetsPath = Join-Path $tempRoot "assets"
    $previousManifestPath = Join-Path $tempRoot "patrol360-assets-current.txt"
    New-Item -ItemType Directory -Path $previousAssetsPath -Force | Out-Null

    try {
        docker cp "${ContainerName}:/srv/assets/." $previousAssetsPath | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not copy the active web assets from $ContainerName."
        }

        docker exec $ContainerName test -f /srv/patrol360-assets-current.txt 2>$null
        $hasPreviousManifest = $LASTEXITCODE -eq 0
        if ($hasPreviousManifest) {
            docker cp "${ContainerName}:/srv/patrol360-assets-current.txt" $previousManifestPath | Out-Null
        }

        if ($hasPreviousManifest -and (Test-Path $previousManifestPath)) {
            $previousAssetNames = @(Get-Content -LiteralPath $previousManifestPath | Where-Object { $_ })
        }
        else {
            # Compatibility with images built before the generation manifest existed.
            $previousAssetNames = @(Get-ChildItem -LiteralPath $previousAssetsPath -File | Select-Object -ExpandProperty Name)
        }

        $retained = 0
        foreach ($assetName in $previousAssetNames) {
            if ([System.IO.Path]::GetFileName($assetName) -ne $assetName) {
                continue
            }

            $source = Join-Path $previousAssetsPath $assetName
            $destination = Join-Path $assetsPath $assetName
            if ((Test-Path $source) -and -not (Test-Path $destination)) {
                Copy-Item -LiteralPath $source -Destination $destination
                $retained++
            }
        }

        Write-Host "Retained $retained previous-generation web assets for open browser tabs."
    }
    finally {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$composeArgs = @(
    "-f", "compose.yaml",
    "-f", "infra\docker\compose.web-prebuilt.yaml",
    "--profile", "app"
)

$apiBefore = Get-ContainerId -Name "patrol360-api"
$postgresBefore = Get-ContainerId -Name "patrol360-postgres"

$webConfig = docker compose @composeArgs config web
if ($webConfig -match "depends_on:") {
    throw "web-prebuilt config still contains depends_on. Refusing web-only update."
}

if (-not $SkipNpmBuild) {
    npm run build --prefix apps\web
}

Merge-PreviousWebAssets -ContainerName "patrol360-web" -DistPath (Join-Path $repoRoot "apps\web\dist")

docker compose @composeArgs build web
docker compose @composeArgs up -d --no-deps web

Wait-Healthy -Name "patrol360-web"

$apiAfter = Get-ContainerId -Name "patrol360-api"
$postgresAfter = Get-ContainerId -Name "patrol360-postgres"

if ($apiBefore -and $apiAfter -and $apiBefore -ne $apiAfter) {
    throw "patrol360-api container changed during web-only update."
}

if ($postgresBefore -and $postgresAfter -and $postgresBefore -ne $postgresAfter) {
    throw "patrol360-postgres container changed during web-only update."
}

$response = Invoke-WebRequest -UseBasicParsing -Uri $CanonicalUrl
if ($response.StatusCode -ne 200) {
    throw "Canonical URL returned HTTP $($response.StatusCode): $CanonicalUrl"
}

$webImage = docker inspect docker-web:latest --format "{{.Id}} {{.Created}}"

Write-Host "Patrol360 web-only update completed."
Write-Host "Canonical URL: $CanonicalUrl"
Write-Host "docker-web:latest $webImage"
Write-Host "patrol360-web health: $(Get-ContainerHealth -Name 'patrol360-web')"
Write-Host "patrol360-api unchanged: $($apiBefore -eq $apiAfter)"
Write-Host "patrol360-postgres unchanged: $($postgresBefore -eq $postgresAfter)"

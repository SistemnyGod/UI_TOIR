param(
    [string]$OutputDir,
    [switch]$Render
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "output\doc\ppe-print-fixture"
}

$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$testProject = Join-Path $repoRoot "tests\Patrol360.Infrastructure.Tests\Patrol360.Infrastructure.Tests.csproj"

$previousRunDb = $env:PATROL360_RUN_DB_INTEGRATION
$previousFixtureDir = $env:PATROL360_PPE_PRINT_FIXTURE_DIR

try {
    $env:PATROL360_RUN_DB_INTEGRATION = "true"
    $env:PATROL360_PPE_PRINT_FIXTURE_DIR = $resolvedOutput

    & dotnet test $testProject --no-restore --filter "FullyQualifiedName~InventoryPpePrintDbIntegrationTests"
    if ($LASTEXITCODE -ne 0) {
        throw "PPE print fixture generation failed. dotnet test exit code: $LASTEXITCODE"
    }
}
finally {
    if ($null -eq $previousRunDb) {
        Remove-Item Env:\PATROL360_RUN_DB_INTEGRATION -ErrorAction SilentlyContinue
    }
    else {
        $env:PATROL360_RUN_DB_INTEGRATION = $previousRunDb
    }

    if ($null -eq $previousFixtureDir) {
        Remove-Item Env:\PATROL360_PPE_PRINT_FIXTURE_DIR -ErrorAction SilentlyContinue
    }
    else {
        $env:PATROL360_PPE_PRINT_FIXTURE_DIR = $previousFixtureDir
    }
}

if ($Render) {
    $soffice = Get-Command soffice -ErrorAction SilentlyContinue
    if ($null -eq $soffice) {
        Write-Warning "LibreOffice soffice was not found. DOCX files were generated, but PDF render was skipped."
    }
    else {
        Get-ChildItem -Path $resolvedOutput -Filter "*.docx" | ForEach-Object {
            & $soffice.Source --headless --convert-to pdf --outdir $resolvedOutput $_.FullName | Out-Host
            if ($LASTEXITCODE -ne 0) {
                throw "LibreOffice failed to render $($_.Name). Exit code: $LASTEXITCODE"
            }
        }

        $pdftoppm = Get-Command pdftoppm -ErrorAction SilentlyContinue
        if ($null -eq $pdftoppm) {
            Write-Warning "pdftoppm was not found. PDF files were generated, but PNG page previews were skipped."
        }
        else {
            $previewDir = Join-Path $resolvedOutput "preview"
            New-Item -ItemType Directory -Force -Path $previewDir | Out-Null
            Get-ChildItem -Path $resolvedOutput -Filter "*.pdf" | ForEach-Object {
                $prefix = Join-Path $previewDir $_.BaseName
                & $pdftoppm.Source -png $_.FullName $prefix | Out-Host
                if ($LASTEXITCODE -ne 0) {
                    throw "pdftoppm failed to render $($_.Name). Exit code: $LASTEXITCODE"
                }
            }
        }
    }
}

Write-Host "PPE print fixture generated in: $resolvedOutput"
Get-ChildItem -Path $resolvedOutput | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$excludedSegments = @(
    "\.vs\",
    "\bin\",
    "\dist\",
    "\node_modules\",
    "\obj\",
    "\output\"
)
$textExtensions = @(
    ".cs",
    ".csproj",
    ".css",
    ".html",
    ".http",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".props",
    ".ps1",
    ".slnx",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml"
)
$knownTextNames = @(
    ".editorconfig",
    ".gitattributes",
    ".gitignore"
)

function Test-IsTextFile($file) {
    return $textExtensions.Contains($file.Extension) -or $knownTextNames.Contains($file.Name)
}

function Test-IsExcluded($path) {
    foreach ($segment in $excludedSegments) {
        if ($path.IndexOf($segment, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }

    return $false
}

$invalidUtf8 = New-Object System.Collections.Generic.List[string]
$utf8Bom = New-Object System.Collections.Generic.List[string]
$checkedCount = 0

Get-ChildItem -LiteralPath $root -Recurse -File |
    Where-Object { (Test-IsTextFile $_) -and -not (Test-IsExcluded $_.FullName) } |
    ForEach-Object {
        $checkedCount += 1
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)

        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $utf8Bom.Add($_.FullName.Substring($root.Length + 1))
        }

        try {
            [void]$utf8Strict.GetString($bytes)
        }
        catch {
            $invalidUtf8.Add($_.FullName.Substring($root.Length + 1))
        }
    }

if ($invalidUtf8.Count -gt 0 -or $utf8Bom.Count -gt 0) {
    if ($invalidUtf8.Count -gt 0) {
        Write-Error ("Invalid UTF-8 files:`n" + ($invalidUtf8 -join "`n"))
    }

    if ($utf8Bom.Count -gt 0) {
        Write-Error ("UTF-8 BOM is not allowed by .editorconfig:`n" + ($utf8Bom -join "`n"))
    }

    exit 1
}

Write-Output "UTF-8 check passed for $checkedCount text files."

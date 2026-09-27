param([int]$Samples = 6, [int]$IntervalSeconds = 10)
$ErrorActionPreference = 'Stop'
$measurements = [Collections.Generic.List[object]]::new()
$previous = @{}
$lastAt = Get-Date
Get-Process | ForEach-Object { $previous[$_.Id] = $_.CPU }
$logicalProcessors = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
for ($index = 0; $index -lt $Samples; $index++) {
  Start-Sleep -Seconds $IntervalSeconds
  $at = Get-Date
  $seconds = ($at - $lastAt).TotalSeconds
  $processes = @(Get-Process | ForEach-Object {
    $cpu = $_.CPU
    $delta = if ($previous.ContainsKey($_.Id) -and $null -ne $cpu) { [Math]::Max(0, $cpu - $previous[$_.Id]) } else { 0 }
    [pscustomobject]@{name=$_.ProcessName; id=$_.Id; memoryMiB=[Math]::Round($_.WorkingSet64/1MB,2); hostCpuPercent=[Math]::Round(100*$delta/$seconds/$logicalProcessors,2)}
    $previous[$_.Id] = $cpu
  })
  $lastAt = $at
  $containers = @(docker stats --no-stream --format '{{json .}}' | ForEach-Object { $_ | ConvertFrom-Json })
  $os = Get-CimInstance Win32_OperatingSystem
  $measurements.Add([pscustomobject]@{at=$at.ToString('o'); logicalProcessors=$logicalProcessors; freeMemoryMiB=[Math]::Round($os.FreePhysicalMemory/1024,2); containers=$containers; processes=$processes})
}
$outputDirectory = Join-Path $PSScriptRoot '../audit-output/server-performance-20260927'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$measurements | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $outputDirectory 'resource-samples.json') -Encoding utf8
Write-Output ('Saved {0} samples to {1}' -f $Samples,$outputDirectory)

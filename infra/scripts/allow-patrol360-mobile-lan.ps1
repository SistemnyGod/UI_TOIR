$ErrorActionPreference = "Stop"

$ruleName = "Patrol360 Mobile API LAN 80 443 5173"
$legacyRuleName = "Patrol360 Mobile API LAN 80 5173"
$localPorts = "80,443,5173"
$remoteSubnet = "192.168.2.0/24"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  throw "Run this script from PowerShell as Administrator."
}

$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
  $existingRule | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any
  $existingRule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $localPorts.Split(',')
  $existingRule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress $remoteSubnet
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort $localPorts.Split(',') -RemoteAddress $remoteSubnet -Profile Any | Out-Null
}
# Retire the old rule only after the complete replacement succeeds.
Get-NetFirewallRule -DisplayName $legacyRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Write-Host "Firewall rule is ready:"
Get-NetFirewallRule -DisplayName $ruleName | Get-NetFirewallPortFilter | Format-Table Protocol, LocalPort

Write-Host ""
Write-Host "Phone test URL:"
Write-Host "https://192.168.2.194/api/v1/mobile/health"

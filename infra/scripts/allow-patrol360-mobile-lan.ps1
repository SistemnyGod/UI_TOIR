$ErrorActionPreference = "Stop"

$ruleName = "Patrol360 Mobile API LAN 80 5173"
$localPorts = "80,5173"
$remoteSubnet = "192.168.2.0/24"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  throw "Run this script from PowerShell as Administrator."
}

netsh advfirewall firewall delete rule name="$ruleName" | Out-Null

netsh advfirewall firewall add rule `
  name="$ruleName" `
  dir=in `
  action=allow `
  protocol=TCP `
  localport=$localPorts `
  remoteip=$remoteSubnet `
  profile=any | Out-Null

Write-Host "Firewall rule is ready:"
netsh advfirewall firewall show rule name="$ruleName"

Write-Host ""
Write-Host "Phone test URL:"
Write-Host "http://192.168.2.194:5173/api/v1/mobile/health"

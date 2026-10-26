# Run as Administrator. Exposes only the existing webmail port on this LAN IP.
$ErrorActionPreference = 'Stop'
$lanAddress = '192.168.0.105'
$ruleName = 'GXWebMail-LAN-7540'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an Administrator PowerShell'
}
if (-not (Get-NetIPAddress -IPAddress $lanAddress -ErrorAction SilentlyContinue)) { throw 'Expected LAN address is not assigned' }
$null = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7540/ko/login' -Method Head -TimeoutSec 10
$mappingKey = 'HKLM:\SYSTEM\CurrentControlSet\Services\PortProxy\v4tov4\tcp'
$mapping = Get-ItemPropertyValue -Path $mappingKey -Name "$lanAddress/7540" -ErrorAction SilentlyContinue
if ($mapping -and $mapping -ne '127.0.0.1/7540') { throw 'Conflicting port mapping; not changed' }
if ((Get-Service iphlpsvc).Status -ne 'Running') { throw 'IP Helper must already be running' }
$rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($rule) {
    $address = $rule | Get-NetFirewallAddressFilter
    $port = $rule | Get-NetFirewallPortFilter
    $sameSubnet = @($address.RemoteAddress).Count -eq 1 -and "$($address.RemoteAddress)" -in @('192.168.0.0/24', '192.168.0.0/255.255.255.0')
    if ($rule.Action -ne 'Allow' -or $rule.Enabled -ne 'True' -or $rule.Direction -ne 'Inbound' -or "$($rule.Profile)" -ne 'Private' -or "$($address.LocalAddress)" -ne $lanAddress -or -not $sameSubnet -or "$($port.Protocol)" -ne 'TCP' -or "$($port.LocalPort)" -ne '7540') {
        throw 'Existing rule differs; inspect it instead of overwriting'
    }
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'GXWebMail LAN 7540 only' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $lanAddress -LocalPort 7540 -RemoteAddress '192.168.0.0/24' -Profile Private | Out-Null
}
if (-not $mapping) {
    netsh interface portproxy add v4tov4 listenaddress=$lanAddress listenport=7540 connectaddress=127.0.0.1 connectport=7540 protocol=tcp
    if ($LASTEXITCODE -ne 0) { throw 'Port mapping failed; proxy not switched' }
}
Write-Output 'LAN 192.168.0.105:7540 -> existing loopback7540. Private subnet only; no new public port.'

# Requires the existing local webmail on loopback 7540 and a trusted SSH host key.
# No firewall, credentials, application settings, or other processes are changed.
$ErrorActionPreference = 'Stop'
$relayHostName = 'whitecalvin@192.168.0.103'
$relayMapping = '127.0.0.1:17540:127.0.0.1:7540'
$relaySsh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$relayOptions = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=5')
$relayExisting = @(Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object {
    $_.CommandLine -like "*-R $relayMapping $relayHostName*"
})
if ($relayExisting.Count -gt 0) {
    Write-Output "Public relay already running: PID $($relayExisting.ProcessId -join ', ')"
    exit 0
}
$relayLocalResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7540/ko/login' -Method Head -TimeoutSec 10
if ($relayLocalResponse.StatusCode -ne 200) { throw 'Local webmail is not ready' }
& $relaySsh @relayOptions $relayHostName 'if ss -lnt | grep -q :17540; then exit 17; fi'
if ($LASTEXITCODE -ne 0) { throw 'Remote port is occupied or SSH check failed; no process was changed' }
$relayArgs = @('-N', '-T') + $relayOptions + @(
    '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=2', '-R', $relayMapping, $relayHostName
)
$relayLog = Join-Path $env:TEMP 'gxwebmail-public-relay-17540.log'
$relayProcess = Start-Process -FilePath $relaySsh -ArgumentList $relayArgs -WindowStyle Hidden -PassThru -RedirectStandardError $relayLog
Write-Output "Started public relay PID $($relayProcess.Id); SSH errors: $relayLog"
Write-Output 'Verify https://webmail-test.gxsoft.co.kr/ko/login. Stop only this PID when intentionally taking the site offline.'

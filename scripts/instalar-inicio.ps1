param(
    [Parameter(Mandatory)][string]$HostTailscale,
    [ValidateSet('preview', 'local')][string]$Modo = 'local',
    [ValidateRange(1, 65535)][int]$Porta = 8787,
    [string]$Go2rtcDir = (Join-Path $env:LOCALAPPDATA 'go2rtc')
)
# Registra a inicialização automática no PC de casa (executar como o usuário que faz logon automático):
#  - CasaLocal-go2rtc: câmeras, no logon, oculto; reinicia se cair.
#  - CasaLocal-servidor: painel em 127.0.0.1, no logon, sem janela (pythonw); reinicia se cair.
# O acesso externo é feito pelo Tailscale Serve (HTTPS só na tailnet); nada é aberto no roteador.
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonw = Join-Path $projectRoot '.venv\Scripts\pythonw.exe'
$go2rtc = Join-Path $Go2rtcDir 'go2rtc.exe'
$go2rtcConfig = Join-Path $Go2rtcDir 'go2rtc.yaml'
foreach ($required in $pythonw, $go2rtc, $go2rtcConfig, (Join-Path $projectRoot 'dist\index.html')) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Arquivo necessário ausente: $required" }
}
if ($HostTailscale -notmatch '^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$') { throw 'Informe o nome exato do Tailscale, por exemplo pc.tailnet.ts.net.' }

$user = "$env:COMPUTERNAME\$env:USERNAME"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$hidden = { param($exe, $arguments, $dir) New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless `"$exe`" $arguments" -WorkingDirectory $dir }
$go2rtcAction = & $hidden $go2rtc "-config `"$go2rtcConfig`"" $Go2rtcDir
Register-ScheduledTask -TaskName 'CasaLocal-go2rtc' -Description 'Casa Local: câmeras (go2rtc em 127.0.0.1:1984).' -Action $go2rtcAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

$launcher = Join-Path $projectRoot 'scripts\servidor-oculto.cmd'
@"
@echo off
set CASA_ALLOWED_HOSTS=$HostTailscale
cd /d "$projectRoot"
"$pythonw" -m backend.server --mode $Modo --port $Porta
"@ | Set-Content -LiteralPath $launcher -Encoding ascii
$serverAction = & $hidden 'cmd.exe' "/c `"$launcher`"" $projectRoot
Register-ScheduledTask -TaskName 'CasaLocal-servidor' -Description "Casa Local: painel em 127.0.0.1:$Porta ($Modo)." -Action $serverAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host 'Tarefas registradas: CasaLocal-go2rtc e CasaLocal-servidor (no logon).'

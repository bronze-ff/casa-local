param([ValidateRange(0, 65535)][int]$Porta = 0)
# Registra o vigia do Casa Local (no PC de casa, como o usuário que roda o painel): a cada
# 2 minutos confere o painel e o go2rtc e reinicia o que tiver caído. Ver scripts\vigia.ps1.
# Sem -Porta, usa a porta configurada por instalar-inicio.ps1 (servidor-oculto.cmd) ou 8787.
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $Porta) {
    $launcher = Join-Path $projectRoot 'scripts\servidor-oculto.cmd'
    $found = if (Test-Path -LiteralPath $launcher) { Select-String -LiteralPath $launcher -Pattern '--port (\d+)' | Select-Object -First 1 } else { $null }
    $Porta = if ($found) { [int]$found.Matches[0].Groups[1].Value } else { 8787 }
}
$script = Join-Path $projectRoot 'scripts\vigia.ps1'
$user = "$env:COMPUTERNAME\$env:USERNAME"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Porta $Porta" -WorkingDirectory $projectRoot
Register-ScheduledTask -TaskName 'CasaLocal-vigia' -Description 'Casa Local: reinicia painel e câmeras se caírem (a cada 2 min).' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Vigia registrado: CasaLocal-vigia (a cada 2 minutos, porta $Porta)."

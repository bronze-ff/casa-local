param(
    [Parameter(Mandatory)][string]$Url,
    [string]$Servicos,
    [string]$Python = 'python'
)
# Instala o ícone do Casa Local na bandeja deste usuário Windows e o inicia com o Windows.
#   PC de casa:  .\tray\instalar-bandeja.ps1 -Url http://127.0.0.1:8787 -Servicos %USERPROFILE%\CasaLocal
#   Notebook:    .\tray\instalar-bandeja.ps1 -Url https://pc.tailnet.ts.net
$ErrorActionPreference = 'Stop'
if ($Url -notmatch '^https?://[A-Za-z0-9.-]+(:\d+)?/?$') { throw 'Use só o endereço base do painel, sem caminho.' }
$target = Join-Path $env:LOCALAPPDATA 'CasaLocalBandeja'
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'casa_tray.py') -Destination $target -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'requirements.txt') -Destination $target -Force
$venv = Join-Path $target 'venv'
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) { & $Python -m venv $venv }
& (Join-Path $venv 'Scripts\python.exe') -m pip install -q --disable-pip-version-check -r (Join-Path $target 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências da bandeja.' }

# Encerra uma instância anterior antes de iniciar a nova.
Get-CimInstance Win32_Process -Filter "name='pythonw.exe'" | Where-Object { $_.CommandLine -like '*casa_tray.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$pythonw = Join-Path $venv 'Scripts\pythonw.exe'
$arguments = @((Join-Path $target 'casa_tray.py'), '--url', $Url)
if ($Servicos) { $arguments += @('--servicos', $Servicos) }
$quoted = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CasaLocalBandeja' -Value "`"$pythonw`" $quoted"
# Atalho no Menu Iniciar para reabrir a bandeja depois de "Sair da Casa".
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Casa Local.lnk'))
$shortcut.TargetPath = $pythonw
$shortcut.Arguments = $quoted
$shortcut.WorkingDirectory = $target
$shortcut.Description = 'Casa Local na bandeja'
$shortcut.Save()

$task = 'CasaLocalBandeja-iniciar'
Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
if (-not $env:SSH_CONNECTION) {
    Start-Process -FilePath $pythonw -ArgumentList $quoted -WorkingDirectory $target
} else {
    # Via SSH o processo nasceria fora da área de trabalho: inicia na sessão interativa por uma tarefa.
    # A tarefa fica registrada (sem gatilho); removê-la logo após iniciar encerraria a bandeja.
    $user = "$env:COMPUTERNAME\$env:USERNAME"
    Register-ScheduledTask -TaskName $task -Action (New-ScheduledTaskAction -Execute $pythonw -Argument $quoted -WorkingDirectory $target) -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive) -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries) -Force | Out-Null
    Start-ScheduledTask -TaskName $task
}
Write-Host "Bandeja instalada em $target e configurada para iniciar com o Windows."

param(
    [Parameter(Mandatory)][string]$Url,
    [string]$Servicos,
    [string]$Python = 'python',
    # Fora do AppData: aberto de dentro de um app empacotado (ex.: Claude), o AppData é desviado e o
    # Windows não acha a bandeja no login.
    [string]$Pasta = (Join-Path $env:USERPROFILE 'CasaLocalBandeja')
)
# Instala o ícone do Casa Local na bandeja deste usuário Windows e o inicia com o Windows.
#   PC de casa:  .\tray\instalar-bandeja.ps1 -Url http://127.0.0.1:8787 -Servicos %USERPROFILE%\CasaLocal
#   Notebook:    .\tray\instalar-bandeja.ps1 -Url https://pc.tailnet.ts.net
$ErrorActionPreference = 'Stop'
if ($Url -notmatch '^https?://[A-Za-z0-9.-]+(:\d+)?/?$') { throw 'Use só o endereço base do painel, sem caminho.' }
$target = $Pasta
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
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CasaLocalBandeja' -ErrorAction SilentlyContinue
# Atalho no Menu Iniciar para reabrir a bandeja depois de "Sair da Casa".
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Casa Local.lnk'))
$shortcut.TargetPath = $pythonw
$shortcut.Arguments = $quoted
$shortcut.WorkingDirectory = $target
$shortcut.Description = 'Casa Local na bandeja'
$shortcut.Save()

# Vigia: a cada 5 min reabre a bandeja se ela caiu sozinha (aberta, ou fechada pelo menu, não faz nada).
$user = "$env:COMPUTERNAME\$env:USERNAME"
$watch = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
# No login abre sempre (sem --vigia), mesmo que ela tenha sido fechada pelo menu antes.
Register-ScheduledTask -TaskName 'CasaLocalBandeja-login' -Description 'Casa Local: abre a bandeja no login.' `
    -Action (New-ScheduledTaskAction -Execute $pythonw -Argument $quoted -WorkingDirectory $target) `
    -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive) `
    -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) -Force | Out-Null
Register-ScheduledTask -TaskName 'CasaLocalBandeja-vigia' -Description 'Casa Local: reabre a bandeja se ela fechar sozinha.' `
    -Action (New-ScheduledTaskAction -Execute $pythonw -Argument "$quoted --vigia" -WorkingDirectory $target) `
    -Trigger $watch -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive) `
    -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew) -Force | Out-Null

# Tarefa antiga de instalações anteriores.
Get-ScheduledTask -TaskName 'CasaLocalBandeja-iniciar' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
# Inicia já pela tarefa de login: abre na sessão interativa, também via SSH ou de dentro de outro app.
Start-ScheduledTask -TaskName 'CasaLocalBandeja-login'
Write-Host "Bandeja instalada em $target e configurada para iniciar com o Windows."

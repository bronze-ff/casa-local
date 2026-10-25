param([ValidateSet('todos', 'go2rtc', 'servidor')][string]$Qual = 'todos')
# Reinicia as tarefas registradas por instalar-inicio.ps1 (necessário após editar go2rtc.yaml ou atualizar o painel).
$ErrorActionPreference = 'Stop'
if ($Qual -in 'todos', 'go2rtc') {
    Stop-ScheduledTask CasaLocal-go2rtc
    Get-Process go2rtc -ErrorAction SilentlyContinue | Stop-Process -Force
}
if ($Qual -in 'todos', 'servidor') {
    Stop-ScheduledTask CasaLocal-servidor
    Get-CimInstance Win32_Process -Filter "name='pythonw.exe'" | Where-Object { $_.CommandLine -like '*backend.server*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}
Start-Sleep 1
if ($Qual -in 'todos', 'go2rtc') { Start-ScheduledTask CasaLocal-go2rtc }
if ($Qual -in 'todos', 'servidor') { Start-ScheduledTask CasaLocal-servidor }
Start-Sleep 4
Get-ScheduledTask CasaLocal-* | ForEach-Object { Write-Output "$($_.TaskName): $($_.State)" }

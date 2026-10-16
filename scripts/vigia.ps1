param([ValidateRange(1, 65535)][int]$Porta = 8787)
# Vigia do Casa Local (tarefa CasaLocal-vigia, a cada 2 minutos): se o painel não responder duas
# vezes seguidas, reinicia o servidor; se o go2rtc não estiver rodando, inicia. Registra em
# .data\vigia.log (as últimas 200 linhas). Só olha este PC; não fala com nenhum aparelho.
$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$log = Join-Path $projectRoot '.data\vigia.log'
function Write-Vigia($text) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $text"
    $lines = @(Get-Content -LiteralPath $log -ErrorAction SilentlyContinue) + $line
    $lines | Select-Object -Last 200 | Set-Content -LiteralPath $log -Encoding utf8
}
function Test-Painel {
    try { return (Invoke-WebRequest "http://127.0.0.1:$Porta/api/status" -Headers @{ Host = 'localhost' } -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200 }
    catch { return $false }
}
$acoes = @()
if (-not (Test-Painel)) {
    Start-Sleep 20
    $servidor = Get-CimInstance Win32_Process -Filter "name='pythonw.exe'" | Where-Object { $_.CommandLine -like '*backend.server*' }
    $subindo = $servidor | Where-Object { ((Get-Date) - $_.CreationDate).TotalSeconds -lt 180 }
    if ($subindo) { $acoes += 'servidor ainda subindo' }
    elseif (-not (Test-Painel)) {
        Stop-ScheduledTask CasaLocal-servidor
        Get-CimInstance Win32_Process -Filter "name='pythonw.exe'" | Where-Object { $_.CommandLine -like '*backend.server*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        Start-Sleep 1
        Start-ScheduledTask CasaLocal-servidor
        $acoes += 'reiniciou servidor'
    }
}
if (-not (Get-Process go2rtc -ErrorAction SilentlyContinue)) {
    Start-ScheduledTask CasaLocal-go2rtc
    $acoes += 'reiniciou go2rtc'
}
Write-Vigia ($(if ($acoes) { $acoes -join ', ' } else { 'ok' }))

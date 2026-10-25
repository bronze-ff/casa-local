param([ValidateRange(1, 65535)][int]$Porta = 8787)
# Vigia do Casa Local (tarefa CasaLocal-vigia, a cada 2 minutos): se o painel não responder duas
# vezes seguidas, reinicia o servidor; se o go2rtc não estiver rodando, inicia. Registra em
# .data\vigia.log (as últimas 200 linhas). Só olha este PC; não fala com nenhum aparelho.
$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$log = Join-Path $projectRoot '.data\vigia.log'
$venvRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.venv')) + '\'
function Get-CasaServidor {
    $todos = @(Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='pythonw.exe'" | Where-Object { $_.CommandLine -match '(?:^|\s)-m\s+backend\.server(?:\s|$)' })
    $lancadores = @($todos | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($venvRoot, [System.StringComparison]::OrdinalIgnoreCase) })
    # O python do .venv só lança o interpretador base como filho: é o filho que segura a porta.
    $ids = @($lancadores | ForEach-Object { $_.ProcessId })
    $lancadores
    $todos | Where-Object { $ids -contains $_.ParentProcessId }
}
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
    $servidor = Get-CasaServidor
    $subindo = $servidor | Where-Object { ((Get-Date) - $_.CreationDate).TotalSeconds -lt 180 }
    if ($subindo) { $acoes += 'servidor ainda subindo' }
    elseif (-not (Test-Painel)) {
        $reiniciou = $false
        try {
            Stop-ScheduledTask CasaLocal-servidor
            Get-CasaServidor | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            Start-Sleep 1
            Start-ScheduledTask CasaLocal-servidor -ErrorAction Stop
            Start-Sleep 5
            $reiniciou = Test-Painel
        } catch { $reiniciou = $false }
        $acoes += $(if ($reiniciou) { 'reiniciou servidor' } else { 'falha ao reiniciar servidor' })
    }
}
# A tarefa instalada pode envolver o executável no conhost para ocultar a janela.
$go2rtcPaths = @((Get-ScheduledTask CasaLocal-go2rtc).Actions | ForEach-Object {
    $executable = [Environment]::ExpandEnvironmentVariables($_.Execute).Trim('"')
    if ([System.IO.Path]::GetFileName($executable) -ieq 'conhost.exe') {
        if ($_.Arguments -notmatch '^--headless\s+"([^"]+go2rtc\.exe)"(?:\s|$)') { return }
        $executable = [Environment]::ExpandEnvironmentVariables($Matches[1])
    }
    if ([System.IO.Path]::GetFileName($executable) -ine 'go2rtc.exe') { return }
    if (-not [System.IO.Path]::IsPathRooted($executable)) {
        if (-not $_.WorkingDirectory) { return }
        $executable = Join-Path ([Environment]::ExpandEnvironmentVariables($_.WorkingDirectory)) $executable
    }
    [System.IO.Path]::GetFullPath($executable)
})
function Get-CasaGo2rtc {
    Get-CimInstance Win32_Process -Filter "name='go2rtc.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -in $go2rtcPaths }
}
if ($go2rtcPaths.Count -and -not (Get-CasaGo2rtc)) {
    try {
        Start-ScheduledTask CasaLocal-go2rtc -ErrorAction Stop
        Start-Sleep 2
        $acoes += $(if (Get-CasaGo2rtc) { 'reiniciou go2rtc' } else { 'falha ao reiniciar go2rtc' })
    } catch { $acoes += 'falha ao reiniciar go2rtc' }
}
Write-Vigia ($(if ($acoes) { $acoes -join ', ' } else { 'ok' }))

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.data\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host 'Sem servidor de segundo plano registrado. Se estiver em um terminal, use Ctrl+C.'
    return
}
$serverProcessId = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$serverProcessId) -or $serverProcessId -le 0) { throw 'Registro de processo inválido.' }
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$serverProcessId"
if (-not $serverProcess) { Write-Host 'A central já está encerrada.'; return }
$expectedPython = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.venv\Scripts\python.exe'))
if (-not $serverProcess.ExecutablePath -or -not [string]::Equals($serverProcess.ExecutablePath, $expectedPython, [System.StringComparison]::OrdinalIgnoreCase) -or $serverProcess.CommandLine -notmatch '(?:^|\s)-m\s+backend\.server(?:\s|$)') {
    throw 'O registro não corresponde ao servidor deste projeto. Nenhum processo foi encerrado.'
}
Stop-Process -Id $serverProcessId
Write-Host 'Central Casa Local encerrada. Você pode iniciar novamente pelo atalho ou pelo script.'

param(
    [ValidateSet('preview', 'local')][string]$Modo = 'preview',
    [switch]$Lan,
    [ValidateRange(1, 65535)][int]$Porta = 8787
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Ambiente ausente. Execute scripts\configurar.ps1 primeiro.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'Painel ainda não compilado. Execute npm run build na pasta do projeto.' }
$active = $null
try { $active = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/status" -TimeoutSec 2 } catch { }
if ($active -and $active.version -eq '0.1.0' -and $active.mode -in @('preview','local')) {
    Write-Host "Casa Local já está aberta: http://127.0.0.1:$Porta (modo $($active.mode))."
    Write-Host 'Para trocar modo ou habilitar LAN, encerre o servidor atual antes de iniciar outro.'
    Write-Host 'Servidor em segundo plano desta preparação: scripts\parar.ps1. Em terminal: Ctrl+C.'
    return
}
Push-Location -LiteralPath $projectRoot
try {
    $serverArgs = @('-m', 'backend.server', '--mode', $Modo, '--port', "$Porta")
    if ($Lan) { $serverArgs += '--lan' }
    & $pythonPath @serverArgs
    if ($LASTEXITCODE -ne 0) { throw 'O servidor local não iniciou.' }
} finally { Pop-Location }

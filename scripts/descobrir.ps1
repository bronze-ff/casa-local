$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Execute scripts\configurar.ps1 primeiro.' }
Push-Location -LiteralPath $projectRoot
try {
    & $pythonPath -m backend.configure discover
    if ($LASTEXITCODE -ne 0) { throw 'Descoberta não concluída.' }
} finally { Pop-Location }

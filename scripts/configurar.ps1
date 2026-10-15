param([string[]]$Argumentos)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
Push-Location -LiteralPath $projectRoot
try {
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        & py -3 -m venv (Join-Path $projectRoot '.venv')
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o ambiente Python. Instale Python 3.11 ou superior.' }
    }
    & $pythonPath -m pip install --disable-pip-version-check -r (Join-Path $projectRoot 'requirements.lock')
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar a dependência local.' }
    if ($Argumentos -and $Argumentos.Count -gt 0) {
        & $pythonPath -m backend.configure @Argumentos
        if ($LASTEXITCODE -ne 0) { throw 'Configuração não concluída.' }
    } else {
        Write-Host 'Ambiente pronto. Prévia: .\scripts\iniciar.ps1'
        Write-Host 'Cadastro local: .venv\Scripts\python.exe -m backend.configure device --help'
        Write-Host 'Chaves ficam criptografadas por usuário Windows em .data\devices.dpapi.'
    }
} finally { Pop-Location }

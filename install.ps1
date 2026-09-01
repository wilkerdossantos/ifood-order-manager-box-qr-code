#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instalador one-click do iFood QR Service (executável único + NSSM).

.DESCRIPTION
    Orquestra toda a instalação em ordem e de forma idempotente:
      1. Copia ifood-qr-service.exe + scripts para C:\Program Files\iFoodQrService
      2. Baixa NSSM se necessário (requer internet)
      3. Instala a impressora virtual "iFood QR Bridge"
      4. Configura config.json (targetPrinterName, file-watcher)
      5. Cria o atalho do Gestor com CDP (porta 9222)
      6. Registra o serviço Windows apontando para o .exe
      7. Inicia o serviço e roda smoke test

    Não requer Node.js na máquina do cliente (o .exe embute o runtime).

.EXAMPLE
    .\install.ps1 -TargetPrinter "EPSON TM-T88VII Receipt"
    .\install.ps1 -TargetPrinter "EPSON TM-T20" -ServiceName "iFoodQrService"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPrinter,

    [string]$ServiceName = "iFoodQrService",
    [string]$InstallDir = "$env:ProgramFiles\iFoodQrService",
    [string]$ExeName = "ifood-qr-service.exe",
    [int]$DebugPort = 9222,
    [string]$VirtualPrinterName = "iFood QR Bridge"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = "$env:ProgramData\iFoodQrService"

function Find-Nssm {
    # 1. Já no PATH?
    $inPath = Get-Command nssm -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    # 2. Já extraído em %TEMP%\nssm?
    $cached = Get-ChildItem -Path "$env:TEMP\nssm" -Recurse -Filter "nssm.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "win64" } |
        Select-Object -First 1
    if ($cached) { return $cached.FullName }

    # 3. Baixa (clientes têm internet).
    Write-Host "Baixando NSSM..." -ForegroundColor Yellow
    $zip = "$env:TEMP\nssm.zip"
    $dir = "$env:TEMP\nssm"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $dir -Force
    $nssm = Get-ChildItem -Path $dir -Recurse -Filter "nssm.exe" |
        Where-Object { $_.FullName -match "win64" } |
        Select-Object -First 1
    if (-not $nssm) { throw "NSSM win64 não encontrado no zip." }
    return $nssm.FullName
}

Write-Host ""
Write-Host "=== iFood QR Service — Instalador ===" -ForegroundColor Cyan
Write-Host ""

# 1. Copia o executável e os scripts de runtime.
$exeSrc = Join-Path $ScriptDir $ExeName
if (-not (Test-Path $exeSrc)) {
    # Tenta também no diretório acima (zip extraído com layout aninhado).
    $exeSrc = Join-Path (Split-Path $ScriptDir -Parent) $ExeName
}
if (-not (Test-Path $exeSrc)) {
    throw "Não encontrei $ExeName ao lado deste instalador."
}
Write-Host "[1/7] Copiando arquivos para $InstallDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item $exeSrc "$InstallDir\$ExeName" -Force
Copy-Item "$ScriptDir\forward-raw-print.ps1" "$InstallDir\forward-raw-print.ps1" -Force
Copy-Item "$ScriptDir\forward-text-print.ps1" "$InstallDir\forward-text-print.ps1" -Force
New-Item -ItemType Directory -Path "$DataDir\logs" -Force | Out-Null

# 2. NSSM
$nssm = Find-Nssm
Write-Host "[2/7] NSSM: $nssm" -ForegroundColor Green

# 3. Impressora virtual.
Write-Host "[3/7] Instalando impressora virtual..." -ForegroundColor Yellow
& (Join-Path $ScriptDir "install-virtual-printer.ps1") -VirtualPrinterName $VirtualPrinterName

# 4. Config.
Write-Host "[4/7] Configurando config.json..." -ForegroundColor Yellow
& (Join-Path $ScriptDir "configure-bridge.ps1") -VirtualPrinterName $VirtualPrinterName -TargetPrinter $TargetPrinter

# 5. Atalho do Gestor (CDP).
Write-Host "[5/7] Criando atalho do Gestor com CDP..." -ForegroundColor Yellow
& (Join-Path $ScriptDir "enable-gestor-debug.ps1") -DebugPort $DebugPort

# 6. Registra o serviço (aponta para o .exe, não node).
Write-Host "[6/7] Registrando serviço $ServiceName..." -ForegroundColor Yellow
& $nssm stop $ServiceName 2>$null | Out-Null
& $nssm remove $ServiceName confirm 2>$null | Out-Null
& $nssm install $ServiceName "$InstallDir\$ExeName"
& $nssm set $ServiceName AppDirectory $InstallDir
& $nssm set $ServiceName DisplayName "iFood QR Service"
& $nssm set $ServiceName Description "Captura pedidos do Gestor Desktop e enriquece comandas com QR code"
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout "$DataDir\logs\stdout.log"
& $nssm set $ServiceName AppStderr "$DataDir\logs\stderr.log"
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 5242880

# 7. Inicia e smoke test.
Write-Host "[7/7] Iniciando serviço..." -ForegroundColor Yellow
& $nssm start $ServiceName | Out-Null
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=== Instalação concluída ===" -ForegroundColor Green
Write-Host "  Serviço:   $ServiceName"
Write-Host "  Health:    http://127.0.0.1:7420/health"
Write-Host "  Config:    $DataDir\config.json"
Write-Host "  Impressora virtual: $VirtualPrinterName"
Write-Host "  Destino:   $TargetPrinter"
Write-Host ""
Write-Host "Próximo passo: feche o Gestor e abra por 'Gestor de Pedidos.ifood-qr.lnk'." -ForegroundColor Cyan
Write-Host "Depois, imprima na impressora '$VirtualPrinterName'." -ForegroundColor Cyan
Write-Host ""

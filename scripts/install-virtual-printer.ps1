#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala a impressora virtual "iFood QR Bridge" com driver "Generic / Text Only"
    e porta de arquivo (FILE:) fixa, para captura do stream raw ESC/POS.

.DESCRIPTION
    A impressora virtual usa o driver "Generic / Text Only" (que gera SPL raw,
    sem EMF) e uma porta de arquivo apontando para output.prn. O spooler grava
    o stream diretamente no arquivo (sem job na fila e sem prompt interativo,
    ao contrario de PORTPROMPT). O servico (file-watcher) monitora o arquivo,
    injeta o QR e reencaminha para a impressora fisica.

.EXAMPLE
    .\install-virtual-printer.ps1
    .\install-virtual-printer.ps1 -VirtualPrinterName "iFood QR Bridge"
#>
param(
    [string]$VirtualPrinterName = "iFood QR Bridge",
    [string]$OutputPrn = "C:\ProgramData\iFoodQrService\spool\output.prn"
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== iFood QR - instalador da impressora virtual ===" -ForegroundColor Cyan
Write-Host ""

# 1. Garante que o diretorio de spool existe.
$spoolDir = Split-Path -Parent $OutputPrn
New-Item -ItemType Directory -Path $spoolDir -Force | Out-Null

# 2. Garante que a porta de arquivo existe (porta local com caminho fixo).
$port = Get-PrinterPort -Name $OutputPrn -ErrorAction SilentlyContinue
if (-not $port) {
    Write-Host "Criando porta de arquivo $OutputPrn..." -ForegroundColor Yellow
    Add-PrinterPort -Name $OutputPrn -ErrorAction Stop
}
else {
    Write-Host "Porta de arquivo $OutputPrn ja existe." -ForegroundColor Green
}

# 3. Verifica se a impressora virtual ja existe.
$existing = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Impressora '$VirtualPrinterName' ja existe (driver $($existing.DriverName))." -ForegroundColor Yellow
    Write-Host "Ajustando porta para $OutputPrn..." -ForegroundColor Yellow
    Set-Printer -Name $VirtualPrinterName -PortName $OutputPrn -ErrorAction Stop
    Write-Host "Porta ajustada." -ForegroundColor Green
    exit 0
}

# 4. Driver "Generic / Text Only" gera SPL raw (sem EMF) — essencial para
#    capturar o stream ESC/POS diretamente.
$driverName = "Generic / Text Only"
$driver = Get-PrinterDriver -Name $driverName -ErrorAction SilentlyContinue
if (-not $driver) {
    Write-Error "Driver '$driverName' nao encontrado. Instale o driver 'Generic / Text Only' do Windows."
}

Write-Host "Instalando impressora '$VirtualPrinterName'..." -ForegroundColor Cyan
Add-Printer -Name $VirtualPrinterName -DriverName $driverName -PortName $OutputPrn -ErrorAction Stop

Write-Host ""
Write-Host "Impressora virtual instalada com sucesso." -ForegroundColor Green
Write-Host "  Nome:   $VirtualPrinterName"
Write-Host "  Porta:  $OutputPrn (arquivo)"
Write-Host "  Driver: $driverName (raw)"
Write-Host ""
Write-Host "Proximo passo: .\configure-portprompt-mode.ps1" -ForegroundColor Yellow

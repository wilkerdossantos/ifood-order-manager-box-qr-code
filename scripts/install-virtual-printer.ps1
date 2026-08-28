#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala a impressora virtual "iFood QR Bridge" com driver "Generic / Text Only"
    e porta PORTPROMPT, para captura do stream raw ESC/POS da fila Windows.

.DESCRIPTION
    A impressora virtual usa o driver "Generic / Text Only" (que gera SPL raw,
    sem EMF) e a porta PORTPROMPT (que segura o job na fila). O servico
    (queue-watcher) le o SPL, injeta o QR e reencaminha para a impressora fisica.

.EXAMPLE
    .\install-virtual-printer.ps1
    .\install-virtual-printer.ps1 -VirtualPrinterName "iFood QR Bridge"
#>
param(
    [string]$VirtualPrinterName = "iFood QR Bridge",
    [string]$PortName = "PORTPROMPT:"
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== iFood QR - instalador da impressora virtual ===" -ForegroundColor Cyan
Write-Host ""

# 1. Garante que a porta PORTPROMPT existe.
$port = Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue
if (-not $port) {
    Write-Host "Criando porta $PortName..." -ForegroundColor Yellow
    Add-PrinterPort -Name $PortName -ErrorAction Stop
}
else {
    Write-Host "Porta $PortName ja existe." -ForegroundColor Green
}

# 2. Verifica se a impressora virtual ja existe.
$existing = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Impressora '$VirtualPrinterName' ja existe (driver $($existing.DriverName))." -ForegroundColor Yellow
    Write-Host "Nada a fazer. Use configure-portprompt-mode.ps1 para ajustar a config." -ForegroundColor Yellow
    exit 0
}

# 3. Driver "Generic / Text Only" gera SPL raw (sem EMF) — essencial para
#    capturar o stream ESC/POS diretamente.
$driverName = "Generic / Text Only"
$driver = Get-PrinterDriver -Name $driverName -ErrorAction SilentlyContinue
if (-not $driver) {
    Write-Error "Driver '$driverName' nao encontrado. Instale o driver 'Generic / Text Only' do Windows."
}

Write-Host "Instalando impressora '$VirtualPrinterName'..." -ForegroundColor Cyan
Add-Printer -Name $VirtualPrinterName -DriverName $driverName -PortName $PortName -ErrorAction Stop

Write-Host ""
Write-Host "Impressora virtual instalada com sucesso." -ForegroundColor Green
Write-Host "  Nome:   $VirtualPrinterName"
Write-Host "  Porta:  $PortName"
Write-Host "  Driver: $driverName (raw)"
Write-Host ""
Write-Host "Proximo passo: .\configure-portprompt-mode.ps1" -ForegroundColor Yellow

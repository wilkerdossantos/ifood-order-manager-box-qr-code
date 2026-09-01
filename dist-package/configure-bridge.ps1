#Requires -Version 5.1
<#
.SYNOPSIS
    Configura o servico para o modo de captura via impressora virtual (porta FILE:).

.DESCRIPTION
    Atualiza %ProgramData%\iFoodQrService\config.json para habilitar o
    file-watcher (printFileWatchEnabled) e definir a impressora virtual
    de captura (printerName) e a impressora fisica de destino
    (targetPrinterName).

.EXAMPLE
    .\configure-bridge.ps1
    .\configure-bridge.ps1 -VirtualPrinterName "iFood QR Bridge" -TargetPrinter "EPSON TM-T20"
#>
param(
    [string]$VirtualPrinterName = "iFood QR Bridge",
    [string]$TargetPrinter = ""
)

$ConfigPath = "$env:ProgramData\iFoodQrService\config.json"
$SpoolDir = "$env:ProgramData\iFoodQrService\spool"

Write-Host ""
Write-Host "=== iFood QR - modo impressora virtual (porta FILE:) ===" -ForegroundColor Cyan
Write-Host ""

# Valida impressora virtual.
$printer = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
    Write-Host "AVISO: impressora virtual '$VirtualPrinterName' nao encontrada." -ForegroundColor Yellow
    Write-Host "Execute .\install-virtual-printer.ps1 primeiro." -ForegroundColor Yellow
}
else {
    Write-Host "Impressora virtual: $VirtualPrinterName" -ForegroundColor Green
    Write-Host "  Porta:  $($printer.PortName)"
    Write-Host "  Driver: $($printer.DriverName)"
    if ($printer.DriverName -notlike "*Generic*" -and $printer.DriverName -notlike "*Text*") {
        Write-Host "  AVISO: driver nao e Generic/Text Only - SPL pode vir como EMF e nao raw." -ForegroundColor Yellow
    }
    if ($printer.PortName -notlike "*.prn" -and $printer.PortName -notlike "*.txt") {
        Write-Host "  AVISO: porta nao e de arquivo (.prn/.txt) - use install-virtual-printer.ps1." -ForegroundColor Yellow
    }
}

# Valida impressora de destino (se fornecida).
if ($TargetPrinter) {
    $target = Get-Printer -Name $TargetPrinter -ErrorAction SilentlyContinue
    if ($target) {
        Write-Host "Impressora de destino: $TargetPrinter" -ForegroundColor Green
    } else {
        Write-Host "AVISO: destino '$TargetPrinter' nao encontrado." -ForegroundColor Yellow
    }
}

New-Item -ItemType Directory -Path $SpoolDir -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null

if (Test-Path $ConfigPath) {
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
}
else {
    $config = New-Object PSObject
}

$config | Add-Member -NotePropertyName printerName -NotePropertyValue $VirtualPrinterName -Force
$config | Add-Member -NotePropertyName targetPrinterName -NotePropertyValue $TargetPrinter -Force
$config | Add-Member -NotePropertyName printFileWatchEnabled -NotePropertyValue $true -Force
$config | Add-Member -NotePropertyName printDebugEnabled -NotePropertyValue $true -Force
$config | Add-Member -NotePropertyName spoolDir -NotePropertyValue $SpoolDir -Force
$config | Add-Member -NotePropertyName printDebugDir -NotePropertyValue (Join-Path $SpoolDir "debug") -Force
$config | Add-Member -NotePropertyName pdfMode -NotePropertyValue $false -Force
$config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8

Write-Host ""
Write-Host "Config atualizado: $ConfigPath" -ForegroundColor Green
Write-Host "  printFileWatchEnabled = true   (monitora output.prn)"
Write-Host "  printerName           = $VirtualPrinterName"
Write-Host "  targetPrinterName     = $TargetPrinter"
Write-Host ""
Write-Host "Proximo passo:" -ForegroundColor Cyan
Write-Host "  1. PowerShell Admin: npm run dev"
Write-Host "  2. No Gestor: imprima na impressora virtual '$VirtualPrinterName'"
Write-Host "  3. O servico captura output.prn, injeta QR e reencaminha para '$TargetPrinter'"
Write-Host ""

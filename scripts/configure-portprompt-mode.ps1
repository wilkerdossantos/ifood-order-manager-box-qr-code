#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Configura o servico para impressora PORTPROMPT + Microsoft Print to PDF (Windows 11).

.EXAMPLE
    .\configure-portprompt-mode.ps1
    .\configure-portprompt-mode.ps1 -TargetPrinter "Microsoft Print to PDF"
#>
param(
    [string]$VirtualPrinterName = "iFood QR Bridge",
    [string]$TargetPrinter = "Microsoft Print to PDF"
)

$ConfigPath = "$env:ProgramData\iFoodQrService\config.json"
$SpoolDir = "$env:ProgramData\iFoodQrService\spool"

Write-Host ""
Write-Host "=== iFood QR - modo PORTPROMPT + PDF ===" -ForegroundColor Cyan
Write-Host ""

$printer = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
    Write-Host "AVISO: impressora '$VirtualPrinterName' nao encontrada." -ForegroundColor Yellow
    Write-Host "Crie manualmente: PORTPROMPT + Microsoft Print to PDF" -ForegroundColor Yellow
}
else {
    Write-Host "Impressora: $VirtualPrinterName" -ForegroundColor Green
    Write-Host "  Porta:   $($printer.PortName)"
    Write-Host "  Driver:  $($printer.DriverName)"
    if ($printer.PortName -notlike "PORTPROMPT*") {
        Write-Host "  AVISO: porta nao e PORTPROMPT - fila pode nao interceptar." -ForegroundColor Yellow
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
$config | Add-Member -NotePropertyName printQueueWatchEnabled -NotePropertyValue $true -Force
$config | Add-Member -NotePropertyName spoolWatchEnabled -NotePropertyValue $false -Force
$config | Add-Member -NotePropertyName printDebugEnabled -NotePropertyValue $true -Force
$config | Add-Member -NotePropertyName spoolDir -NotePropertyValue $SpoolDir -Force
$config | Add-Member -NotePropertyName printDebugDir -NotePropertyValue (Join-Path $SpoolDir "debug") -Force
$config | Add-Member -NotePropertyName pdfMode -NotePropertyValue $false -Force
$config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8

Write-Host ""
Write-Host "Config atualizado: $ConfigPath" -ForegroundColor Green
Write-Host "  printQueueWatchEnabled = true  (intercepta fila Windows)"
Write-Host "  spoolWatchEnabled      = false (nao usa porta arquivo)"
Write-Host "  targetPrinterName      = $TargetPrinter"
Write-Host ""
Write-Host "AVISO: Impressora virtual 'iFood QR Bridge' e experimental." -ForegroundColor Yellow
Write-Host "       Prefira impressora fisica ou Print to PDF direto." -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. PowerShell Admin: npm run dev"
Write-Host "  2. npm run enable:gestor  (CDP captura pedidos + hook impressao)"
Write-Host "  3. Imprimir pelo Gestor em '$VirtualPrinterName'"
Write-Host ""

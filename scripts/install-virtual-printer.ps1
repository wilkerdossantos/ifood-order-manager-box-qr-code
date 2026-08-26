#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala impressora virtual "iFood QR Bridge" para interceptar comandas do Gestor.

.DESCRIPTION
    Cria impressora Generic/Text Only que redireciona jobs para print-port-receiver.js.
    Requer RedMon (http://www.redmon.com/downloads.html) para redirecionar porta -> programa.

.PARAMETER TargetPrinter
    Impressora fisica de destino (ex.: "EPSON TM-T20" ou "Microsoft Print to PDF").

.EXAMPLE
    .\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF"

.NOTES
    Execute com PowerShell (nao bash/sh):
      .\scripts\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF"
      npm run install:virtual-printer -- -TargetPrinter "Microsoft Print to PDF"
#>

param(
    [string]$TargetPrinter = "",
    [string]$VirtualPrinterName = "iFood QR Bridge"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ReceiverScript = Join-Path $ScriptDir "print-port-receiver.js"
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
$ConfigPath = "$env:ProgramData\iFoodQrService\config.json"
$RedMonGuid = "{12345678-1234-1234-1234-123456789ABC}"

Write-Host ""
Write-Host "=== iFood QR - Impressora Virtual ===" -ForegroundColor Cyan
Write-Host ""

if (-not $NodePath) {
    Write-Error "Node.js nao encontrado. Instale Node.js 18+."
}

if (-not (Test-Path $ReceiverScript)) {
    Write-Error "Receiver nao encontrado: $ReceiverScript"
}

# Atualizar config.json com target printer
if ($TargetPrinter) {
    New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null
    $config = @{}
    if (Test-Path $ConfigPath) {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json -AsHashtable
    }
    $config["printerName"] = $VirtualPrinterName
    $config["targetPrinterName"] = $TargetPrinter
    $config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8
    Write-Host "Config atualizado: targetPrinterName = $TargetPrinter" -ForegroundColor Green
} else {
    Write-Host "AVISO: -TargetPrinter nao informado. Configure targetPrinterName em config.json" -ForegroundColor Yellow
}

# Verificar RedMon
$RedMonPort = Get-PrinterPort -Name "RPT1:" -ErrorAction SilentlyContinue
$RedMonInstalled = $null -ne $RedMonPort

if (-not $RedMonInstalled) {
    Write-Host ""
    Write-Host "RedMon NAO detectado (porta RPT1:)." -ForegroundColor Yellow
    Write-Host "Instale RedMon 1.9: http://www.redmon.com/downloads.html" -ForegroundColor White
    Write-Host "Depois execute este script novamente." -ForegroundColor White
    Write-Host ""
}

# Criar impressora virtual (Generic / Text Only)
$existing = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Impressora '$VirtualPrinterName' ja existe." -ForegroundColor Green
} else {
    if ($RedMonInstalled) {
        Add-Printer -Name $VirtualPrinterName -DriverName "Generic / Text Only" -PortName "RPT1:"
        Write-Host "Impressora criada: $VirtualPrinterName (porta RPT1:)" -ForegroundColor Green
    } else {
        # Fallback: FILE port para testes manuais
        $FilePort = "FILE:"
        if (-not (Get-PrinterPort -Name $FilePort -ErrorAction SilentlyContinue)) {
            Add-PrinterPort -Name $FilePort -FileName "$env:TEMP\ifood-qr-output.prn"
        }
        Add-Printer -Name $VirtualPrinterName -DriverName "Generic / Text Only" -PortName $FilePort
        $msg = "Impressora criada (modo FILE - instale RedMon para producao): $VirtualPrinterName"
        Write-Host $msg -ForegroundColor Yellow
    }
}

# Configurar RedMon (registry) - redirect to node receiver
$RedMonKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\Redirected Port\RPT1:"

if ($RedMonInstalled) {
    $Command = "`"$NodePath`" `"$ReceiverScript`""
    New-Item -Path $RedMonKey -Force | Out-Null
    Set-ItemProperty -Path $RedMonKey -Name "Command" -Value $Command
    Set-ItemProperty -Path $RedMonKey -Name "Arguments" -Value ""
    Set-ItemProperty -Path $RedMonKey -Name "Output" -Value 0
    Set-ItemProperty -Path $RedMonKey -Name "RunUser" -Value 1
    Set-ItemProperty -Path $RedMonKey -Name "Delay" -Value 100
    Set-ItemProperty -Path $RedMonKey -Name "LogFileUse" -Value 1
    Set-ItemProperty -Path $RedMonKey -Name "LogFileName" -Value "$env:ProgramData\iFoodQrService\logs\redmon.log"
    Set-ItemProperty -Path $RedMonKey -Name "LogFileDebug" -Value 1
    Set-ItemProperty -Path $RedMonKey -Name "PrintError" -Value 0
    Write-Host "RedMon configurado: $Command" -ForegroundColor Green
}

Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "  1. npm run dev  (servico na porta 7420)"
Write-Host "  2. No Gestor -> Impressora -> '$VirtualPrinterName'"
if ($TargetPrinter) {
    Write-Host "  3. Jobs serao encaminhados para: $TargetPrinter"
}
Write-Host ""
Write-Host "Teste manual (sem RedMon):" -ForegroundColor White
Write-Host "  Get-Content docs\fixtures\invoice-sample.txt -Raw | node `"$ReceiverScript`" --stdin" -ForegroundColor Gray
Write-Host ""
Write-Host "Documentacao: docs/PRINT-BRIDGE-DRIVER.md" -ForegroundColor Gray
Write-Host ""

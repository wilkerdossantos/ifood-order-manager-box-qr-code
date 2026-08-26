#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala impressora virtual "iFood QR Bridge" (Windows 11, sem RedMon).

.DESCRIPTION
    Cria impressora com porta local -> arquivo .prn
    O servico iFood QR monitora o arquivo e enriquece + encaminha automaticamente.

.EXAMPLE
    .\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF"
#>

param(
    [string]$TargetPrinter = "",
    [string]$VirtualPrinterName = "iFood QR Bridge"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = "$env:ProgramData\iFoodQrService\config.json"
$SpoolDir = "$env:ProgramData\iFoodQrService\spool"
$SpoolFile = Join-Path $SpoolDir "output.prn"

function Get-GenericTextDriverName {
    $preferred = @(
        'Generic / Text Only',
        'Generic / Text Only (0001)',
        'Generico / Somente Texto',
        'Generico / Somente Texto (0001)'
    )
    foreach ($name in $preferred) {
        if (Get-PrinterDriver -Name $name -ErrorAction SilentlyContinue) {
            return $name
        }
    }
    $found = Get-PrinterDriver -ErrorAction SilentlyContinue | Where-Object {
        $n = $_.Name
        ($n -match 'Generic|Generico|Gen') -and ($n -match 'Text|Texto|Somente')
    } | Select-Object -First 1
    if ($found) { return $found.Name }
    return $null
}

function Install-GenericTextDriver {
    $ntprint = Join-Path $env:windir 'inf\ntprint.inf'
    if (-not (Test-Path $ntprint)) { return $null }

    foreach ($name in @('Generic / Text Only', 'Generico / Somente Texto')) {
        try {
            Add-PrinterDriver -Name $name -InfPath $ntprint -ErrorAction Stop
            Write-Host "Driver instalado: $name" -ForegroundColor Green
            return $name
        } catch { }
    }

    try {
        $printUiArgs = "/ia /m `"Generic / Text Only`" /h `"Intel`" /v `"Type 3 - User Mode`" /f `"$ntprint`""
        Start-Process -FilePath "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry $printUiArgs" -Wait -NoNewWindow
    } catch { }

    return (Get-GenericTextDriverName)
}

function New-VirtualPrinter {
    param([string]$Name, [string]$PortName)

    $driver = Get-GenericTextDriverName
    if (-not $driver) {
        Write-Host "Instalando driver Generic/Text..." -ForegroundColor Yellow
        $driver = Install-GenericTextDriver
    }
    if (-not $driver) {
        Write-Host "ERRO: driver Generic/Text nao encontrado." -ForegroundColor Red
        Write-Host "Drivers disponiveis:" -ForegroundColor Yellow
        Get-PrinterDriver -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  - $($_.Name)" }
        return $false
    }

    Write-Host "Driver: $driver" -ForegroundColor Gray

    if (-not (Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue)) {
        Add-PrinterPort -Name $PortName -ErrorAction Stop
    }

    try {
        Add-Printer -Name $Name -DriverName $driver -PortName $PortName -ErrorAction Stop
    } catch {
        Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }

    return ($null -ne (Get-Printer -Name $Name -ErrorAction SilentlyContinue))
}

Write-Host ""
Write-Host "=== iFood QR - Impressora Virtual (Windows 11, sem RedMon) ===" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Path $SpoolDir -Force | Out-Null
if (-not (Test-Path $SpoolFile)) {
    New-Item -ItemType File -Path $SpoolFile -Force | Out-Null
}

# config.json
New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null
if (Test-Path $ConfigPath) {
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
} else {
    $config = New-Object PSObject
}

$config | Add-Member -NotePropertyName printerName -NotePropertyValue $VirtualPrinterName -Force
$config | Add-Member -NotePropertyName spoolWatchEnabled -NotePropertyValue $true -Force
$config | Add-Member -NotePropertyName spoolDir -NotePropertyValue $SpoolDir -Force
if ($TargetPrinter) {
    $config | Add-Member -NotePropertyName targetPrinterName -NotePropertyValue $TargetPrinter -Force
}
$config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8

if ($TargetPrinter) {
    Write-Host "Config: targetPrinterName = $TargetPrinter" -ForegroundColor Green
} else {
    Write-Host "AVISO: use -TargetPrinter `"Microsoft Print to PDF`"" -ForegroundColor Yellow
}

Write-Host "Spool: $SpoolFile" -ForegroundColor Gray

$existing = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
$printerOk = $false

if ($existing) {
    Write-Host "Impressora '$VirtualPrinterName' ja existe." -ForegroundColor Green
    $printerOk = $true
} else {
    $printerOk = New-VirtualPrinter -Name $VirtualPrinterName -PortName $SpoolFile
    if ($printerOk) {
        Write-Host "Impressora criada: $VirtualPrinterName" -ForegroundColor Green
        Write-Host "  Porta local: $SpoolFile" -ForegroundColor Gray
    }
}

if ($TargetPrinter) {
    if (-not (Get-Printer -Name $TargetPrinter -ErrorAction SilentlyContinue)) {
        Write-Host "AVISO: destino '$TargetPrinter' nao encontrado no Windows." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
if (-not $printerOk) {
    Write-Host "  [!] Falha ao criar impressora." -ForegroundColor Red
}
Write-Host "  1. npm run dev"
Write-Host "  2. Gestor -> Impressora -> '$VirtualPrinterName'"
if ($TargetPrinter) {
    Write-Host "  3. Jobs vao para: $TargetPrinter (via spool watcher)"
}
Write-Host ""
Write-Host "Log esperado ao imprimir:" -ForegroundColor White
Write-Host "  [SPOOL] Job de impressao detectado" -ForegroundColor Gray
Write-Host "  [SPOOL] QR adicionado a comanda" -ForegroundColor Gray
Write-Host "  [SPOOL] Comanda encaminhada para impressora" -ForegroundColor Gray
Write-Host ""

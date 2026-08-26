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
    if (-not (Test-Path $ntprint)) {
        return $null
    }
    $names = @('Generic / Text Only', 'Generico / Somente Texto')
    foreach ($name in $names) {
        try {
            Add-PrinterDriver -Name $name -InfPath $ntprint -ErrorAction Stop
            Write-Host "Driver instalado: $name" -ForegroundColor Green
            return $name
        } catch {
            # tenta proximo nome
        }
    }
    # Fallback: printui (funciona em mais versoes do Windows)
    try {
        $args = "/ia /m `"Generic / Text Only`" /h `"Intel`" /v `"Type 3 - User Mode`" /f `"$ntprint`""
        Start-Process -FilePath "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry $args" -Wait -NoNewWindow
        $driver = Get-GenericTextDriverName
        if ($driver) {
            Write-Host "Driver instalado via printui: $driver" -ForegroundColor Green
            return $driver
        }
    } catch {
        # ignore
    }
    return (Get-GenericTextDriverName)
}

function New-VirtualPrinter {
    param(
        [string]$Name,
        [string]$PortName
    )
    $driver = Get-GenericTextDriverName
    if (-not $driver) {
        Write-Host "Driver Generic/Text nao encontrado. Instalando..." -ForegroundColor Yellow
        $driver = Install-GenericTextDriver
    }
    if (-not $driver) {
        Write-Host "ERRO: Nenhum driver Generic/Text disponivel." -ForegroundColor Red
        Write-Host "Drivers instalados no sistema:" -ForegroundColor Yellow
        Get-PrinterDriver -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  - $($_.Name)" }
        Write-Host ""
        Write-Host "Instale manualmente: Configuracoes -> Impressoras -> Adicionar -> Generic / Text Only" -ForegroundColor White
        return $false
    }

    Write-Host "Usando driver: $driver" -ForegroundColor Gray
    try {
        Add-Printer -Name $Name -DriverName $driver -PortName $PortName -ErrorAction Stop
    } catch {
        Write-Host "ERRO ao criar impressora: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }

    $created = Get-Printer -Name $Name -ErrorAction SilentlyContinue
    if (-not $created) {
        Write-Host "ERRO: Impressora '$Name' nao foi criada." -ForegroundColor Red
        return $false
    }
    return $true
}

Write-Host ""
Write-Host "=== iFood QR - Impressora Virtual ===" -ForegroundColor Cyan
Write-Host ""

if (-not $NodePath) {
    Write-Error "Node.js nao encontrado. Instale Node.js 18+."
}

if (-not (Test-Path $ReceiverScript)) {
    Write-Error "Receiver nao encontrado: $ReceiverScript"
}

# Atualizar config.json com target printer (compativel PowerShell 5.1)
if ($TargetPrinter) {
    New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null
    if (Test-Path $ConfigPath) {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    } else {
        $config = New-Object PSObject
    }
    $config | Add-Member -NotePropertyName printerName -NotePropertyValue $VirtualPrinterName -Force
    $config | Add-Member -NotePropertyName targetPrinterName -NotePropertyValue $TargetPrinter -Force
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
$printerOk = $false
if ($existing) {
    Write-Host "Impressora '$VirtualPrinterName' ja existe." -ForegroundColor Green
    $printerOk = $true
} elseif ($RedMonInstalled) {
    $printerOk = New-VirtualPrinter -Name $VirtualPrinterName -PortName "RPT1:"
    if ($printerOk) {
        Write-Host "Impressora criada: $VirtualPrinterName (porta RPT1:)" -ForegroundColor Green
    }
} else {
    # Fallback sem RedMon: porta local -> arquivo .prn (nao executa receiver automaticamente)
    $spoolDir = "$env:ProgramData\iFoodQrService\spool"
    New-Item -ItemType Directory -Path $spoolDir -Force | Out-Null
    $spoolFile = Join-Path $spoolDir "output.prn"
    $portName = $spoolFile
    if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {
        try {
            Add-PrinterPort -Name $portName -ErrorAction Stop
        } catch {
            Write-Host "AVISO: Nao foi possivel criar porta $portName" -ForegroundColor Yellow
        }
    }
    $printerOk = New-VirtualPrinter -Name $VirtualPrinterName -PortName $portName
    if ($printerOk) {
        Write-Host "Impressora criada (modo arquivo - instale RedMon para producao): $VirtualPrinterName" -ForegroundColor Yellow
        Write-Host "  Jobs salvos em: $spoolFile" -ForegroundColor Gray
        Write-Host "  RedMon necessario para enriquecer automaticamente." -ForegroundColor Gray
    }
}

if ($TargetPrinter) {
    $targetExists = Get-Printer -Name $TargetPrinter -ErrorAction SilentlyContinue
    if (-not $targetExists) {
        Write-Host "AVISO: Impressora destino '$TargetPrinter' nao encontrada no Windows." -ForegroundColor Yellow
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
if (-not $printerOk) {
    Write-Host "  [!] Corrija a criacao da impressora antes de continuar." -ForegroundColor Red
}
if (-not $RedMonInstalled) {
    Write-Host "  [!] Instale RedMon e execute este script novamente (obrigatorio para interceptar jobs)." -ForegroundColor Yellow
    Write-Host "      http://www.redmon.com/downloads.html" -ForegroundColor Gray
}
Write-Host "  1. npm run dev  (servico na porta 7420)"
if ($printerOk) {
    Write-Host "  2. No Gestor -> Impressora -> '$VirtualPrinterName'"
}
if ($TargetPrinter) {
    Write-Host "  3. Jobs serao encaminhados para: $TargetPrinter"
}
Write-Host ""
Write-Host "Teste manual (sem RedMon):" -ForegroundColor White
Write-Host "  Get-Content docs\fixtures\invoice-sample.txt -Raw | node `"$ReceiverScript`" --stdin" -ForegroundColor Gray
Write-Host ""
Write-Host "Documentacao: docs/PRINT-BRIDGE-DRIVER.md" -ForegroundColor Gray
Write-Host ""

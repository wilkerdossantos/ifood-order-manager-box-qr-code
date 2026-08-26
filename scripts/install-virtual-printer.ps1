#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala impressora virtual "iFood QR Bridge" (Windows 11, sem RedMon).

.EXAMPLE
    .\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF"
    .\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF" -DriverName "Generic / Text Only"
#>

param(
    [string]$TargetPrinter = "Microsoft Print to PDF",
    [string]$VirtualPrinterName = "iFood QR Bridge",
    [string]$DriverName = "Microsoft Print To PDF",
    [switch]$UseFilePort
)

$ErrorActionPreference = "Continue"

$ConfigPath = "$env:ProgramData\iFoodQrService\config.json"
$SpoolDir = "$env:ProgramData\iFoodQrService\spool"
$SpoolFile = Join-Path $SpoolDir "output.prn"

function Get-GenericTextDriverName {
    param([string[]]$ExtraNames = @())

    $preferred = @(
        'Generic / Text Only',
        'Generic / Text Only (0001)',
        'Generico / Somente Texto',
        'Generico / Somente Texto (0001)',
        'Generic Text Only'
    ) + $ExtraNames

    foreach ($name in $preferred) {
        if ($name -and (Get-PrinterDriver -Name $name -ErrorAction SilentlyContinue)) {
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

function Get-GenericModelsFromInf {
    param([string]$InfPath)

    if (-not (Test-Path $InfPath)) { return @() }

    $models = @()
    try {
        $lines = Get-Content -Path $InfPath -ErrorAction Stop
    } catch {
        return @()
    }

    foreach ($line in $lines) {
        if ($line -match '^\s*"([^"]+)"\s*=') {
            $model = $matches[1]
            if ($model -match 'Generic|Generico|Text Only|Somente Texto|Somente') {
                $models += $model
            }
        }
    }

    return $models | Select-Object -Unique
}

function Install-GenericTextDriver {
    $infFiles = @(
        (Join-Path $env:windir 'inf\ntprint.inf'),
        (Join-Path $env:windir 'inf\ntprint4.inf')
    )

    $modelsFromInf = @()
    foreach ($inf in $infFiles) {
        if (Test-Path $inf) {
            Write-Host "pnputil: $inf" -ForegroundColor Gray
            $null = & pnputil.exe /add-driver $inf /install 2>&1
            $modelsFromInf += Get-GenericModelsFromInf -InfPath $inf
        }
    }

    $modelsFromInf = $modelsFromInf | Select-Object -Unique
    if ($modelsFromInf.Count -gt 0) {
        Write-Host "Modelos Generic no INF:" -ForegroundColor Gray
        $modelsFromInf | ForEach-Object { Write-Host "  - $_" }
    }

    $driver = Get-GenericTextDriverName -ExtraNames $modelsFromInf
    if ($driver) { return $driver }

    foreach ($inf in $infFiles) {
        if (-not (Test-Path $inf)) { continue }
        foreach ($model in $modelsFromInf) {
            try {
                Add-PrinterDriver -Name $model -InfPath $inf -ErrorAction Stop
                Write-Host "Driver instalado (Add-PrinterDriver): $model" -ForegroundColor Green
                return $model
            } catch { }
        }
        foreach ($model in @('Generic / Text Only', 'Generico / Somente Texto')) {
            try {
                Add-PrinterDriver -Name $model -InfPath $inf -ErrorAction Stop
                Write-Host "Driver instalado: $model" -ForegroundColor Green
                return $model
            } catch { }
        }
    }

    $archs = @('x64', 'Intel', 'Windows x64', 'Windows NT x86', 'Windows ARM64')
    foreach ($inf in $infFiles) {
        if (-not (Test-Path $inf)) { continue }
        foreach ($arch in $archs) {
            foreach ($model in (@('Generic / Text Only') + $modelsFromInf)) {
                try {
                    $uiArgs = "/ia /m `"$model`" /h `"$arch`" /v `"Type 3 - User Mode`" /f `"$inf`""
                    Start-Process -FilePath "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry $uiArgs" -Wait -NoNewWindow -ErrorAction SilentlyContinue
                    $driver = Get-GenericTextDriverName -ExtraNames $modelsFromInf
                    if ($driver) {
                        Write-Host "Driver instalado (printui): $driver" -ForegroundColor Green
                        return $driver
                    }
                } catch { }
            }
        }
    }

    return (Get-GenericTextDriverName -ExtraNames $modelsFromInf)
}

function Show-ManualDriverHelp {
    Write-Host ""
    Write-Host "INSTALACAO MANUAL DO DRIVER (Windows 11):" -ForegroundColor Yellow
    Write-Host "  1. Configuracoes -> Bluetooth e dispositivos -> Impressoras e scanners"
    Write-Host "  2. Adicionar impressora -> Adicionar manualmente"
    Write-Host "  3. Porta local -> caminho:"
    Write-Host "     $SpoolFile" -ForegroundColor Cyan
    Write-Host "  4. Fabricante: Generic | Modelo: Generic / Text Only"
    Write-Host "  5. Nome: $VirtualPrinterName"
    Write-Host ""
    Write-Host "Depois rode de novo (so atualiza config):" -ForegroundColor White
    Write-Host "  .\scripts\install-virtual-printer.ps1 -TargetPrinter `"Microsoft Print to PDF`" -DriverName `"Generic / Text Only`"" -ForegroundColor Gray
    Write-Host ""
}

function New-VirtualPrinter {
    param(
        [string]$Name,
        [string]$PortName,
        [string]$ForceDriver = "",
        [switch]$PortPrompt
    )

    $driver = $ForceDriver
    if (-not $driver) {
        if ($PortPrompt) {
            $driver = "Microsoft Print To PDF"
            if (-not (Get-PrinterDriver -Name $driver -ErrorAction SilentlyContinue)) {
                $driver = "Microsoft Print to PDF"
            }
        } else {
            $driver = Get-GenericTextDriverName
        }
    }
    if (-not $driver -and -not $PortPrompt) {
        Write-Host "Instalando driver Generic/Text..." -ForegroundColor Yellow
        $driver = Install-GenericTextDriver
    }
    if (-not $driver) {
        Write-Host "ERRO: driver nao encontrado." -ForegroundColor Red
        Write-Host "Drivers no sistema:" -ForegroundColor Yellow
        Get-PrinterDriver -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  - $($_.Name)" }
        if (-not $PortPrompt) { Show-ManualDriverHelp }
        return $false
    }

    Write-Host "Driver: $driver" -ForegroundColor Green

    if ($PortPrompt) {
        $PortName = "PORTPROMPT:"
    }

    if ($PortName -ne "PORTPROMPT:" -and -not (Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue)) {
        try {
            Add-PrinterPort -Name $PortName -ErrorAction Stop
            Write-Host "Porta criada: $PortName" -ForegroundColor Gray
        } catch {
            Write-Host "ERRO ao criar porta: $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    }

    try {
        Add-Printer -Name $Name -DriverName $driver -PortName $PortName -ErrorAction Stop
    } catch {
        Write-Host "ERRO ao criar impressora: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }

    $created = Get-Printer -Name $Name -ErrorAction SilentlyContinue
    if (-not $created) {
        Write-Host "ERRO: impressora nao apareceu apos Add-Printer." -ForegroundColor Red
        return $false
    }

    return $true
}

Write-Host ""
Write-Host "=== iFood QR - Impressora Virtual (Windows 11) ===" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Path $SpoolDir -Force | Out-Null
if (-not (Test-Path $SpoolFile)) {
    New-Item -ItemType File -Path $SpoolFile -Force | Out-Null
}

New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null
if (Test-Path $ConfigPath) {
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
} else {
    $config = New-Object PSObject
}

$config | Add-Member -NotePropertyName printerName -NotePropertyValue $VirtualPrinterName -Force
$config | Add-Member -NotePropertyName spoolWatchEnabled -NotePropertyValue $false -Force
$config | Add-Member -NotePropertyName spoolDir -NotePropertyValue $SpoolDir -Force
$config | Add-Member -NotePropertyName printDebugEnabled -NotePropertyValue $true -Force
$config | Add-Member -NotePropertyName printDebugDir -NotePropertyValue (Join-Path $SpoolDir "debug") -Force
$config | Add-Member -NotePropertyName printQueueWatchEnabled -NotePropertyValue $true -Force
if ($TargetPrinter) {
    $config | Add-Member -NotePropertyName targetPrinterName -NotePropertyValue $TargetPrinter -Force
}
$config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8

Write-Host "Config salvo: $ConfigPath" -ForegroundColor Green
if ($TargetPrinter) {
    Write-Host "  targetPrinterName = $TargetPrinter"
}
Write-Host "  spoolDir = $SpoolDir"
Write-Host ""

$existing = Get-Printer -Name $VirtualPrinterName -ErrorAction SilentlyContinue
$printerOk = $false

if ($existing) {
    Write-Host "Impressora '$VirtualPrinterName' ja existe." -ForegroundColor Green
    $port = (Get-Printer -Name $VirtualPrinterName).PortName
    $drv = (Get-Printer -Name $VirtualPrinterName).DriverName
    Write-Host "  Porta: $port | Driver: $drv" -ForegroundColor Gray
    if ($port -like "PORTPROMPT*") {
        Write-Host "  Modo PORTPROMPT detectado — fila Windows sera monitorada pelo servico." -ForegroundColor Cyan
    }
    $printerOk = $true
} else {
    if ($UseFilePort) {
        $printerOk = New-VirtualPrinter -Name $VirtualPrinterName -PortName $SpoolFile -ForceDriver $DriverName
        if ($printerOk) {
            Write-Host "Impressora OK: $VirtualPrinterName -> $SpoolFile" -ForegroundColor Green
            $config | Add-Member -NotePropertyName spoolWatchEnabled -NotePropertyValue $true -Force
            $config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8
        }
    } else {
        $printerOk = New-VirtualPrinter -Name $VirtualPrinterName -PortName "PORTPROMPT:" -ForceDriver $DriverName -PortPrompt
        if ($printerOk) {
            Write-Host "Impressora OK: $VirtualPrinterName (PORTPROMPT + PDF)" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
if (-not $printerOk) {
    Write-Host "  [!] Instale o driver manualmente (instrucoes acima) e rode o script de novo." -ForegroundColor Red
} else {
    Write-Host "  1. PowerShell Admin: npm run dev"
    Write-Host "  2. Gestor -> Impressora -> '$VirtualPrinterName'"
    Write-Host "  3. Debug: C:\ProgramData\iFoodQrService\spool\debug\"
    if ($TargetPrinter) {
        Write-Host "  4. Destino final: $TargetPrinter (TEXT legivel se for PDF)"
    }
}
Write-Host ""

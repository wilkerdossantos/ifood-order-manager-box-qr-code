#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala o iFood QR Service como serviço Windows via NSSM.

.DESCRIPTION
    Requer Node.js 18+ e NSSM (https://nssm.cc/download) no PATH.
    Alternativamente, baixa NSSM automaticamente se não estiver instalado.

.EXAMPLE
    .\install-service.ps1
#>

param(
    [string]$ServiceName = "iFoodQrService",
    [string]$InstallDir = "$env:ProgramFiles\iFoodQrService",
    [string]$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
)

$ErrorActionPreference = "Stop"

if (-not $NodePath) {
    Write-Error "Node.js não encontrado. Instale Node.js 18+ antes de continuar."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "=== iFood QR Service Installer ===" -ForegroundColor Cyan

# Build project
Push-Location $ProjectRoot
npm ci
npm run build
Pop-Location

# Copy files to install dir
Write-Host "Copiando arquivos para $InstallDir..."
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Recurse "$ProjectRoot\dist" "$InstallDir\dist"
Copy-Item -Recurse "$ProjectRoot\scripts" "$InstallDir\scripts"
Copy-Item "$ProjectRoot\package.json" "$InstallDir\"
Copy-Item "$ProjectRoot\package-lock.json" "$InstallDir\" -ErrorAction SilentlyContinue
Push-Location $InstallDir
npm ci --omit=dev
Pop-Location

# Ensure ProgramData config dir
$DataDir = "$env:ProgramData\iFoodQrService"
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
New-Item -ItemType Directory -Path "$DataDir\logs" -Force | Out-Null

# Find or download NSSM
$Nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $Nssm) {
    Write-Host "NSSM não encontrado. Baixando..."
    $NssmZip = "$env:TEMP\nssm.zip"
    $NssmDir = "$env:TEMP\nssm"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $NssmZip
    Expand-Archive -Path $NssmZip -DestinationPath $NssmDir -Force
    $NssmExe = Get-ChildItem -Path $NssmDir -Recurse -Filter "nssm.exe" |
        Where-Object { $_.FullName -match "win64" } |
        Select-Object -First 1
    if (-not $NssmExe) { Write-Error "NSSM win64 não encontrado no zip." }
    $NssmPath = $NssmExe.FullName
} else {
    $NssmPath = $Nssm.Source
}

$MainScript = "$InstallDir\dist\service\main.js"

# Remove existing service if present
& $NssmPath stop $ServiceName 2>$null
& $NssmPath remove $ServiceName confirm 2>$null

# Install service
Write-Host "Instalando serviço $ServiceName..."
& $NssmPath install $ServiceName $NodePath $MainScript
& $NssmPath set $ServiceName AppDirectory $InstallDir
& $NssmPath set $ServiceName DisplayName "iFood QR Service"
& $NssmPath set $ServiceName Description "Captura pedidos do Gestor Desktop e enriquece comandas com QR code"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout "$DataDir\logs\stdout.log"
& $NssmPath set $ServiceName AppStderr "$DataDir\logs\stderr.log"
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateBytes 5242880

# Start service
& $NssmPath start $ServiceName

Write-Host ""
Write-Host "Serviço instalado e iniciado!" -ForegroundColor Green
Write-Host "  Health:  http://127.0.0.1:7420/health"
Write-Host "  Proxy:   http://127.0.0.1:8888 (configure proxy do sistema)"
Write-Host "  Pipe:    \\.\pipe\ifood-qr-service"
Write-Host "  Config:  $DataDir\config.json"
Write-Host "  CA Cert: $DataDir\certs\ca-cert.pem"
Write-Host ""
Write-Host "Execute install-ca-cert.ps1 para instalar o certificado raiz do proxy."

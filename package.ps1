#Requires -Version 5.1
<#
.SYNOPSIS
    Monta o pacote distribuível (zip) do iFood QR Service.

.DESCRIPTION
    Roda na MÁQUINA DE BUILD (Windows) após `npm run build:exe`. Reúne:
      - ifood-qr-service.exe
      - forward-raw-print.ps1 / forward-text-print.ps1 (helpers de runtime)
      - install.ps1 (instalador one-click)
      - README-instalacao.txt
    Em um único zip na raiz do projeto.

.EXAMPLE
    npm run package
#>
param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\dist-package")
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$bundleDir = Join-Path $root "dist-bundle"
$exe = Join-Path $bundleDir "ifood-qr-service.exe"
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$zipName = "ifood-qr-service-v$version.zip"
$zipPath = Join-Path $root $zipName

if (-not (Test-Path $exe)) {
    throw "ifood-qr-service.exe não encontrado. Rode 'npm run build:exe' primeiro."
}

Write-Host "=== iFood QR Service — empacotamento ===" -ForegroundColor Cyan

# Prepara pasta temporária com o layout final do zip.
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Remove-Item (Join-Path $OutDir "*") -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item $exe (Join-Path $OutDir "ifood-qr-service.exe")
Copy-Item (Join-Path $PSScriptRoot "install.ps1") (Join-Path $OutDir "install.ps1")
Copy-Item (Join-Path $PSScriptRoot "install-virtual-printer.ps1") (Join-Path $OutDir "install-virtual-printer.ps1")
Copy-Item (Join-Path $PSScriptRoot "configure-bridge.ps1") (Join-Path $OutDir "configure-bridge.ps1")
Copy-Item (Join-Path $PSScriptRoot "enable-gestor-debug.ps1") (Join-Path $OutDir "enable-gestor-debug.ps1")
Copy-Item (Join-Path $PSScriptRoot "forward-raw-print.ps1") (Join-Path $OutDir "forward-raw-print.ps1")
Copy-Item (Join-Path $PSScriptRoot "forward-text-print.ps1") (Join-Path $OutDir "forward-text-print.ps1")

# README de instalação.
$readme = @"
iFood QR Service — v$version
============================

INSTALAÇÃO (máquina do cliente, sem Node.js):

1. Extraia este zip.
2. Abra PowerShell como Administrador na pasta extraída.
3. Rode:

     .\install.ps1 -TargetPrinter "NOME_DA_IMPRESSORA_TERMICA"

   (ex.: "EPSON TM-T88VII Receipt", "EPSON TM-T20", "Microsoft Print to PDF" para teste)

Isso instala o serviço, a impressora virtual "iFood QR Bridge" e o atalho do
Gestor com debug. Requer internet apenas para baixar o NSSM (uma vez).

USO DIÁRIO:
- Feche o Gestor e abra por "Gestor de Pedidos.ifood-qr.lnk".
- Imprima na impressora "iFood QR Bridge".

VERIFICAÇÃO:
- Health:  http://127.0.0.1:7420/health
- Logs:    C:\ProgramData\iFoodQrService\logs\
"@
Set-Content -Path (Join-Path $OutDir "README-instalacao.txt") -Value $readme -Encoding UTF8

# Gera o zip.
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Pacote gerado: $zipPath" -ForegroundColor Green
$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  tamanho: $sizeMb MB"
Write-Host ""

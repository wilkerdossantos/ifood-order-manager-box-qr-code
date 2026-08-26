#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala o certificado raiz do proxy HTTPS do iFood QR Service.
#>

$DataDir = "$env:ProgramData\iFoodQrService"
$CaCert = "$DataDir\certs\ca-cert.pem"

if (-not (Test-Path $CaCert)) {
    Write-Error "Certificado não encontrado em $CaCert. Inicie o serviço primeiro para gerá-lo."
}

Write-Host "Instalando certificado raiz do iFood QR Service..." -ForegroundColor Cyan

$Cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CaCert)
$Store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
    "Root", "LocalMachine"
)
$Store.Open("ReadWrite")
$Store.Add($Cert)
$Store.Close()

Write-Host "Certificado instalado em Autoridades de Certificação Raiz Confiáveis." -ForegroundColor Green
Write-Host ""
Write-Host "Configure o proxy do Windows:"
Write-Host "  Configurações → Rede → Proxy → Manual"
Write-Host "  Endereço: 127.0.0.1  Porta: 8888"

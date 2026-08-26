#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Remove o serviço Windows iFood QR Service.
#>

param(
    [string]$ServiceName = "iFoodQrService"
)

$Nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $Nssm) {
    $NssmExe = Get-ChildItem -Path "$env:TEMP\nssm" -Recurse -Filter "nssm.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "win64" } |
        Select-Object -First 1
    if ($NssmExe) { $NssmPath = $NssmExe.FullName } else { Write-Error "NSSM não encontrado." }
} else {
    $NssmPath = $Nssm.Source
}

& $NssmPath stop $ServiceName 2>$null
& $NssmPath remove $ServiceName confirm

Write-Host "Serviço $ServiceName removido." -ForegroundColor Green

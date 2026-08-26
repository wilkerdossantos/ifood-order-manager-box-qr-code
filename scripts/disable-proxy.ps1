#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Desativa o proxy manual do Windows (restaura internet imediatamente).
#>

Write-Host "Desativando proxy do Windows..." -ForegroundColor Cyan

Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" `
  -Name ProxyEnable -Value 0

$current = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" `
  | Select-Object ProxyEnable, ProxyServer

Write-Host "Proxy desativado." -ForegroundColor Green
Write-Host "  ProxyEnable: $($current.ProxyEnable)"
Write-Host "  ProxyServer: $($current.ProxyServer) (ignorado enquanto desativado)"
Write-Host ""
Write-Host "Reinicie o Gestor de Pedidos se ainda mostrar erro de conexão."

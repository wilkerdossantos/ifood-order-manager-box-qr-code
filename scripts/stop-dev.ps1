#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Encerra instâncias do iFood QR Service que estão usando as portas 7420 e 8888.
#>

$Ports = @(7420, 8888)
$Killed = @()

Write-Host "=== Parando iFood QR Service ===" -ForegroundColor Cyan

foreach ($Port in $Ports) {
    $Connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Listen' }

    foreach ($Conn in $Connections) {
        $Pid = $Conn.OwningProcess
        if ($Killed -contains $Pid) { continue }

        $Process = Get-Process -Id $Pid -ErrorAction SilentlyContinue
        $Name = if ($Process) { $Process.ProcessName } else { 'unknown' }

        Write-Host "Porta $Port em uso pelo PID $Pid ($Name) — encerrando..."
        Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
        $Killed += $Pid
    }
}

# Também tenta parar serviço Windows se instalado
$Nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($Nssm) {
    & nssm stop iFoodQrService 2>$null
    Write-Host "Serviço Windows iFoodQrService parado (se existia)."
}

if ($Killed.Count -eq 0) {
    Write-Host "Nenhum processo encontrado nas portas 7420/8888." -ForegroundColor Yellow
} else {
    Write-Host "Processos encerrados: $($Killed -join ', ')" -ForegroundColor Green
}

Write-Host ""
Write-Host "Agora pode rodar: npm run dev"

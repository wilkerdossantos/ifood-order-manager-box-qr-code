<#
.SYNOPSIS
    Encerra instancias do iFood QR Service nas portas 7420 e 8888.
#>

$Ports = @(7420, 8888)
$Killed = @()

Write-Host "=== Parando iFood QR Service ===" -ForegroundColor Cyan

foreach ($Port in $Ports) {
    $Connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Listen' }

    foreach ($Conn in $Connections) {
        $procId = $Conn.OwningProcess
        if ($Killed -contains $procId) { continue }

        $Process = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $Name = if ($Process) { $Process.ProcessName } else { 'unknown' }

        Write-Host "Porta $Port em uso pelo PID $procId ($Name) - encerrando..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        $Killed += $procId
    }
}

$Nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($Nssm) {
    & nssm stop iFoodQrService 2>$null
    Write-Host "Servico Windows iFoodQrService parado (se existia)."
}

if ($Killed.Count -eq 0) {
    Write-Host "Nenhum processo encontrado nas portas 7420/8888." -ForegroundColor Yellow
} else {
    Write-Host "Processos encerrados: $($Killed -join ', ')" -ForegroundColor Green
}

Write-Host ""
Write-Host "Agora pode rodar: npm run dev"

<#
.SYNOPSIS
    Habilita a porta de debug (9222) no atalho do Gestor de Pedidos Desktop.

.DESCRIPTION
    O serviço iFood QR captura pedidos via Chrome DevTools Protocol (CDP).
    O Gestor Desktop NÃO expõe essa porta por padrão — é preciso adicionar
    --remote-debugging-port=9222 ao executável.

    Este script localiza o atalho do Gestor e cria uma cópia com o argumento.

.EXAMPLE
    .\enable-gestor-debug.ps1
    .\enable-gestor-debug.ps1 -DebugPort 9222
#>

param(
    [int]$DebugPort = 9222
)

$ErrorActionPreference = "Stop"

$debugArg = "--remote-debugging-port=$DebugPort"

Write-Host ""
Write-Host "=== iFood QR — Habilitar debug do Gestor Desktop ===" -ForegroundColor Cyan
Write-Host ""

function Find-GestorShortcut {
    $searchPaths = @(
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
        "$env:USERPROFILE\Desktop",
        "$env:PUBLIC\Desktop"
    )

    foreach ($base in $searchPaths) {
        if (-not (Test-Path $base)) { continue }
        $found = Get-ChildItem -Path $base -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match 'Gestor|Pedidos|iFood|order.manager' }
        if ($found) { return $found | Select-Object -First 1 }
    }
    return $null
}

function Get-ShortcutTarget {
    param([string]$LnkPath)
    $shell = New-Object -ComObject WScript.Shell
    return $shell.CreateShortcut($LnkPath)
}

$shortcut = Find-GestorShortcut

if (-not $shortcut) {
    Write-Host "Atalho do Gestor não encontrado automaticamente." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Faça manualmente:" -ForegroundColor White
    Write-Host "  1. Clique direito no atalho do Gestor de Pedidos -> Propriedades"
    Write-Host "  2. No campo Destino, adicione ao final:"
    Write-Host "     $debugArg" -ForegroundColor Green
    Write-Host "  3. Exemplo:"
    Write-Host '     "C:\...\Gestor de Pedidos.exe" --remote-debugging-port=9222' -ForegroundColor Gray
    Write-Host ""
    Write-Host "  4. Feche o Gestor completamente e abra pelo atalho modificado"
    Write-Host ""
    Write-Host "Teste se a porta está aberta (com Gestor rodando):"
    Write-Host "  Invoke-WebRequest http://127.0.0.1:$DebugPort/json/list" -ForegroundColor Gray
    exit 1
}

Write-Host "Atalho encontrado: $($shortcut.FullName)" -ForegroundColor Green

$lnk = Get-ShortcutTarget -LnkPath $shortcut.FullName
$target = $lnk.TargetPath
$args = $lnk.Arguments

if ($args -match 'remote-debugging-port') {
    Write-Host "Debug já habilitado neste atalho: $args" -ForegroundColor Green
} else {
    $newShortcutPath = [System.IO.Path]::ChangeExtension($shortcut.FullName, ".debug.lnk")
    $newLnk = Get-ShortcutTarget -LnkPath $newShortcutPath
    $newLnk.TargetPath = $target
    $newLnk.WorkingDirectory = $lnk.WorkingDirectory
    $newLnk.IconLocation = $lnk.IconLocation
    $newLnk.Description = "Gestor de Pedidos (debug CDP porta $DebugPort)"
    $newArgs = if ($args) { "$args $debugArg" } else { $debugArg }
    $newLnk.Arguments = $newArgs.Trim()
    $newLnk.Save()

    Write-Host ""
    Write-Host "Novo atalho criado:" -ForegroundColor Green
    Write-Host "  $newShortcutPath"
    Write-Host "  Destino: $target"
    Write-Host "  Args:    $newArgs"
}

Write-Host ""
Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "  1. Feche o Gestor de Pedidos completamente (bandeja + Gerenciador de Tarefas)"
Write-Host "  2. Abra pelo atalho *debug* (ou atalho modificado)"
Write-Host "  3. Rode: npm run dev"
Write-Host "  4. Receba um pedido — deve aparecer [CDP] Pedido capturado"
Write-Host ""
Write-Host "Verificar conexão CDP:" -ForegroundColor White
Write-Host "  http://127.0.0.1:$DebugPort/json/list" -ForegroundColor Gray
Write-Host "  http://127.0.0.1:7420/diagnostics" -ForegroundColor Gray
Write-Host ""

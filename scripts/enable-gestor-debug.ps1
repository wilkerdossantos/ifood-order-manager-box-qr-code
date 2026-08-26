<#
.SYNOPSIS
    Habilita debug CDP + hook de impressão no atalho do Gestor de Pedidos Desktop.

.DESCRIPTION
    Adiciona ao Gestor:
      --remote-debugging-port=9222   (captura pedidos via CDP)
      --require="...\print-main-hook.cjs"   (intercepta impressão no processo principal)

.EXAMPLE
    .\enable-gestor-debug.ps1
#>

param(
    [int]$DebugPort = 9222
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HookPath = Join-Path $ScriptDir "print-main-hook.cjs"

if (-not (Test-Path $HookPath)) {
    Write-Error "Hook não encontrado: $HookPath"
}

$debugArg = "--remote-debugging-port=$DebugPort"
$requireArg = "--require=`"$HookPath`""

Write-Host ""
Write-Host "=== iFood QR — Configurar Gestor Desktop ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Hook de impressão: $HookPath" -ForegroundColor Gray

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

function Build-Args {
    param([string]$ExistingArgs)

    $parts = @()
    if ($ExistingArgs) { $parts += $ExistingArgs.Trim() }

    if ($parts -notmatch 'remote-debugging-port') {
        $parts += $debugArg
    }
    if ($parts -notmatch 'print-main-hook') {
        $parts += $requireArg
    }

    return ($parts -join ' ').Trim()
}

$shortcut = Find-GestorShortcut

if (-not $shortcut) {
    Write-Host "Atalho do Gestor não encontrado automaticamente." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Adicione manualmente ao Destino do atalho:" -ForegroundColor White
    Write-Host "  $debugArg" -ForegroundColor Green
    Write-Host "  $requireArg" -ForegroundColor Green
    Write-Host ""
    Write-Host "Exemplo completo:"
    Write-Host "  `"C:\...\Gestor de Pedidos.exe`" $debugArg $requireArg" -ForegroundColor Gray
    exit 1
}

Write-Host "Atalho encontrado: $($shortcut.FullName)" -ForegroundColor Green

$lnk = Get-ShortcutTarget -LnkPath $shortcut.FullName
$target = $lnk.TargetPath
$newArgs = Build-Args -ExistingArgs $lnk.Arguments

$newShortcutPath = [System.IO.Path]::ChangeExtension($shortcut.FullName, ".ifood-qr.lnk")
$newLnk = Get-ShortcutTarget -LnkPath $newShortcutPath
$newLnk.TargetPath = $target
$newLnk.WorkingDirectory = $lnk.WorkingDirectory
$newLnk.IconLocation = $lnk.IconLocation
$newLnk.Description = "Gestor de Pedidos + iFood QR (CDP + impressão)"
$newLnk.Arguments = $newArgs
$newLnk.Save()

Write-Host ""
Write-Host "Atalho criado/atualizado:" -ForegroundColor Green
Write-Host "  $newShortcutPath"
Write-Host "  Args: $newArgs"
Write-Host ""
Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "  1. npm run dev   (serviço na porta 7420 — OBRIGATÓRIO para impressão)"
Write-Host "  2. Feche o Gestor completamente"
Write-Host "  3. Abra pelo atalho *.ifood-qr.lnk"
Write-Host "  4. Ao imprimir, no console do Gestor deve aparecer:"
Write-Host "     [iFood QR] Impressão interceptada"
Write-Host "     [iFood QR] QR adicionado"
Write-Host ""
Write-Host "Preview das comandas: C:\ProgramData\iFoodQrService\print-preview\" -ForegroundColor Gray
Write-Host ""

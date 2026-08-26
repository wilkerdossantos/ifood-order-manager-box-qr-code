<#
.SYNOPSIS
    Configura atalho do Gestor com CDP (pedidos) + hook de impressao (sem RedMon).

.DESCRIPTION
    Adiciona ao Gestor Desktop:
      --remote-debugging-port=9222          captura pedidos via CDP
      --require="...\print-main-hook.cjs"   intercepta printOrder (sem RedMon)

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
    Write-Error "Hook nao encontrado: $HookPath"
}

$debugArg = "--remote-debugging-port=$DebugPort"
$requireArg = "--require=`"$HookPath`""

Write-Host ""
Write-Host "=== iFood QR - Configurar Gestor (sem RedMon) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Hook de impressao: $HookPath" -ForegroundColor Gray
Write-Host "Nao precisa de impressora virtual nem RedMon." -ForegroundColor Gray
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

function Build-Args {
    param([string]$ExistingArgs)

    $combined = if ($ExistingArgs) { $ExistingArgs.Trim() } else { "" }

    if ($combined -notmatch 'remote-debugging-port') {
        $combined = "$combined $debugArg".Trim()
    }
    if ($combined -notmatch 'print-main-hook') {
        $combined = "$combined $requireArg".Trim()
    }

    return $combined
}

$shortcut = Find-GestorShortcut

if (-not $shortcut) {
    Write-Host "Atalho do Gestor nao encontrado." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Adicione manualmente ao Destino do atalho:" -ForegroundColor White
    Write-Host "  $debugArg" -ForegroundColor Green
    Write-Host "  $requireArg" -ForegroundColor Green
    Write-Host ""
    exit 1
}

Write-Host "Atalho encontrado: $($shortcut.FullName)" -ForegroundColor Green

$lnk = Get-ShortcutTarget -LnkPath $shortcut.FullName
$newArgs = Build-Args -ExistingArgs $lnk.Arguments

$newShortcutPath = [System.IO.Path]::ChangeExtension($shortcut.FullName, ".ifood-qr.lnk")
$newLnk = Get-ShortcutTarget -LnkPath $newShortcutPath
$newLnk.TargetPath = $lnk.TargetPath
$newLnk.WorkingDirectory = $lnk.WorkingDirectory
$newLnk.IconLocation = $lnk.IconLocation
$newLnk.Description = "Gestor de Pedidos + iFood QR"
$newLnk.Arguments = $newArgs
$newLnk.Save()

Write-Host ""
Write-Host "Atalho criado:" -ForegroundColor Green
Write-Host "  $newShortcutPath"
Write-Host "  Args: $newArgs"
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "  1. npm run dev"
Write-Host "  2. Feche o Gestor completamente"
Write-Host "  3. Abra pelo atalho *.ifood-qr.lnk"
Write-Host "  4. No Gestor, use a impressora normal (ex: Microsoft Print to PDF)"
Write-Host "  5. Ao imprimir, no console do Gestor:"
Write-Host "     [iFood QR] print-main-hook.cjs carregado"
Write-Host "     [iFood QR] QR adicionado"
Write-Host ""
Write-Host "Preview: C:\ProgramData\iFoodQrService\print-preview\" -ForegroundColor Gray
Write-Host ""

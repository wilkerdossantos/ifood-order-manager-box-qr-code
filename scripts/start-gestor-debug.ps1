<#
.SYNOPSIS
    Inicia Gestor Desktop patched (--app-path + CDP).
#>
param([int]$DebugPort = 9222)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GestorUnpackDir = Join-Path ${env:ProgramData} "iFoodQrService\gestor-unpacked"
$GestorExe = "${env:ProgramFiles(x86)}\Gestor de Pedidos\Gestor de Pedidos.exe"

if (-not (Test-Path (Join-Path $GestorUnpackDir "src\ipcHandler.js"))) {
  & (Join-Path $ScriptDir "setup-gestor-patch.ps1")
}

function Start-ShortcutOrExe {
  param(
    [string[]]$ShortcutCandidates,
    [string]$Exe,
    [string[]]$Args
  )
  foreach ($p in $ShortcutCandidates) {
    if (Test-Path $p) {
      Write-Host "Abrindo: $p" -ForegroundColor Green
      Start-Process $p
      return
    }
  }
  Write-Host "Iniciando: $Exe $($Args -join ' ')" -ForegroundColor Yellow
  Start-Process -FilePath $Exe -ArgumentList $Args
}

Start-ShortcutOrExe @(
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Gestor de Pedidos.ifood-qr.lnk",
  "$env:PUBLIC\Desktop\Gestor de Pedidos.ifood-qr.lnk",
  "$env:USERPROFILE\Desktop\Gestor de Pedidos.ifood-qr.lnk"
) -Exe $GestorExe -Args @("--remote-debugging-port=$DebugPort", "--app-path=$GestorUnpackDir")

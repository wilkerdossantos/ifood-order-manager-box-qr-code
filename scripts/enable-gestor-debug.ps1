<#
.SYNOPSIS
    Cria o atalho do Gestor Desktop com a porta de debug (CDP) habilitada.

.DESCRIPTION
    A captura de pedidos usa o Chrome DevTools Protocol na porta 9222.
    Este script cria um atalho "Gestor de Pedidos.ifood-qr.lnk" que inicia
    o Gestor com --remote-debugging-port=9222. Nao patcheia o app (a
    abordagem de hook no Electron foi descartada — ver ADR-004).

.EXAMPLE
    .\enable-gestor-debug.ps1
    .\enable-gestor-debug.ps1 -DebugPort 9222
#>
param([int]$DebugPort = 9222)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GestorExe = "${env:ProgramFiles(x86)}\Gestor de Pedidos\Gestor de Pedidos.exe"

if (-not (Test-Path $GestorExe)) {
    Write-Error "Gestor nao encontrado em $GestorExe"
}

function New-AppShortcut {
  param(
    [string]$SourcePattern,
    [string]$TargetExe,
    [string]$Arguments,
    [string]$OutputName,
    [string[]]$SearchPaths
  )

  $shortcut = $null
  foreach ($base in $SearchPaths) {
    if (-not (Test-Path $base)) { continue }
    $found = Get-ChildItem $base -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match $SourcePattern -and $_.Name -notmatch 'ifood-qr' } |
      Select-Object -First 1
    if ($found) { $shortcut = $found; break }
  }

  if (-not $shortcut) {
    Write-Warning "Atalho nao encontrado ($SourcePattern) — criando em Start Menu"
    $base = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
    New-Item -ItemType Directory -Path $base -Force | Out-Null
    $shortcut = Join-Path $base ($OutputName -replace '\.ifood-qr\.lnk$', '.lnk')
    if (-not (Test-Path $shortcut)) {
      $shell = New-Object -ComObject WScript.Shell
      $lnk = $shell.CreateShortcut($shortcut)
      $lnk.TargetPath = $TargetExe
      $lnk.WorkingDirectory = Split-Path $TargetExe -Parent
      $lnk.Save()
    }
    $shortcut = Get-Item $shortcut
  }

  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($shortcut.FullName)
  $newPath = Join-Path (Split-Path $shortcut.FullName -Parent) $OutputName
  $newLnk = $shell.CreateShortcut($newPath)
  $newLnk.TargetPath = $TargetExe
  $newLnk.WorkingDirectory = $lnk.WorkingDirectory
  if ($lnk.IconLocation) { $newLnk.IconLocation = $lnk.IconLocation }
  $newLnk.Description = "iFood QR (CDP debug)"
  $newLnk.Arguments = $Arguments
  $newLnk.Save()
  return $newPath
}

$searchPaths = @(
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
  "$env:PUBLIC\Desktop",
  "$env:USERPROFILE\Desktop"
)

Write-Host ""
Write-Host "=== Atalho iFood QR (CDP debug) ===" -ForegroundColor Cyan

$gestorArgs = "--remote-debugging-port=$DebugPort"
$gestorShortcut = New-AppShortcut `
  -SourcePattern 'Gestor de Pedidos' `
  -TargetExe $GestorExe `
  -Arguments $gestorArgs `
  -OutputName "Gestor de Pedidos.ifood-qr.lnk" `
  -SearchPaths $searchPaths
Write-Host "Gestor: $gestorShortcut" -ForegroundColor Green
Write-Host "  Args: $gestorArgs"

Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "  1. Feche o Gestor Desktop completamente (bandeja do sistema)"
Write-Host "  2. Abra pelo atalho Gestor de Pedidos.ifood-qr.lnk"
Write-Host "  3. npm run dev"
Write-Host "  4. Receba um pedido — log: [CDP] Pedido capturado"
Write-Host "  5. Imprima na impressora virtual 'iFood QR Bridge'"
Write-Host ""

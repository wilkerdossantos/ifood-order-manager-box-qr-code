# Extrai Gestor, copia scripts e injeta hooks (thermal-printer.print + CDP).
# Fluxo alvo: Gestor Desktop — ver docs/spec/gestor-desktop-integration.md
$ErrorActionPreference = "Stop"
$GestorExe = "${env:ProgramFiles(x86)}\Gestor de Pedidos\Gestor de Pedidos.exe"
$GestorAsar = "${env:ProgramFiles(x86)}\Gestor de Pedidos\resources\app.asar"
$UnpackDir = Join-Path ${env:ProgramData} "iFoodQrService\gestor-unpacked"
$ScriptsDest = Join-Path ${env:ProgramData} "iFoodQrService\scripts"
$RepoScripts = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path $GestorExe)) { Write-Error "Gestor nao encontrado" }
Write-Host "=== Preparar Gestor patched ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $ScriptsDest -Force | Out-Null
Copy-Item (Join-Path $RepoScripts "enrich-cli.cjs") $ScriptsDest -Force
Copy-Item (Join-Path $RepoScripts "enrich-client.cjs") $ScriptsDest -Force
Copy-Item (Join-Path $RepoScripts "gestor-preload-hook.mjs") $ScriptsDest -Force
Copy-Item (Join-Path $RepoScripts "gestor-ipc-print-hook.mjs") $ScriptsDest -Force
$needsExtract = -not (Test-Path (Join-Path $UnpackDir "package.json"))
if (-not $needsExtract) {
  $installedVersion = (Get-Item $GestorExe).VersionInfo.FileVersion
  $marker = Join-Path $UnpackDir ".gestor-version"
  $storedVersion = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { "" }
  if ($installedVersion -ne $storedVersion) { Remove-Item $UnpackDir -Recurse -Force -ErrorAction SilentlyContinue; $needsExtract = $true }
}
if ($needsExtract) {
  Write-Host "Extraindo app.asar..."
  New-Item -ItemType Directory -Path $UnpackDir -Force | Out-Null
  Push-Location $RepoScripts; npx --yes asar extract $GestorAsar $UnpackDir; Pop-Location
  (Get-Item $GestorExe).VersionInfo.FileVersion | Set-Content (Join-Path $UnpackDir ".gestor-version")
}
Copy-Item (Join-Path $RepoScripts "gestor-ipc-print-hook.mjs") (Join-Path $UnpackDir "src\ifood-qr-ipc-hook.mjs") -Force
$PreloadPath = Join-Path $UnpackDir "src\preload.mjs"
$preload = Get-Content $PreloadPath -Raw
$preloadImport = 'import "./ifood-qr-preload-hook.mjs";'
if ($preload -notmatch [regex]::Escape($preloadImport)) {
  Set-Content $PreloadPath ($preloadImport + "`r`n" + $preload) -Encoding UTF8 -NoNewline
  Write-Host "preload.mjs patched" -ForegroundColor Green
}

# main.mjs — patch thermal-printer.print (intercepta TODAS as impressoes)
$MainPath = Join-Path $UnpackDir "src\main.mjs"
$main = Get-Content $MainPath -Raw
$mainImport = @"
import iFoodThermalPrinter from "@ifood/thermal-printer";
import { installThermalPrinterHook } from "./ifood-qr-ipc-hook.mjs";
"@
if ($main -notmatch 'installThermalPrinterHook') {
  $main = $main -replace '(import tray from "\./tray/tray\.js";)', "`$1`r`n$mainImport"
}
if ($main -notmatch 'installThermalPrinterHook\(iFoodThermalPrinter\)') {
  $main = $main -replace '(const startup = \(\) => \{)', "`$1`r`n`tinstallThermalPrinterHook(iFoodThermalPrinter);"
}
Set-Content $MainPath $main -Encoding UTF8 -NoNewline
Write-Host "main.mjs patched (thermal-printer.print hook)" -ForegroundColor Green

# ipcHandler — remove hook antigo se existir (evita duplicacao)
$IpcPath = Join-Path $UnpackDir "src\ipcHandler.js"
$ipc = Get-Content $IpcPath -Raw
$ipc = $ipc -replace 'import \{ enrichPrintInvoice \} from "\./ifood-qr-ipc-hook\.mjs";\r?\n', ''
$ipc = $ipc -replace 'const finalInvoice = enrichPrintInvoice\(invoice, printerName\);\r?\n\s*', ''
Set-Content $IpcPath $ipc -Encoding UTF8 -NoNewline
Write-Host "ipcHandler.js limpo (hook via thermal-printer)" -ForegroundColor Green

if ((Get-Content $MainPath -Raw) -notmatch 'installThermalPrinterHook') {
  Write-Error "Falha: main.mjs nao contem installThermalPrinterHook"
}
Write-Host "OK: $UnpackDir" -ForegroundColor Green
Write-Host "Reinicie o Gestor Desktop pelo atalho .ifood-qr.lnk" -ForegroundColor Yellow
Write-Host "Log do hook: $env:ProgramData\iFoodQrService\logs\print-hook.log" -ForegroundColor Yellow

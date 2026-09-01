#Requires -Version 5.1
<#
.SYNOPSIS
    Envia um arquivo raw (ESC/POS) para uma impressora, via spooler Windows
    em modo RAW (sem reprocessar pelo driver).

.EXAMPLE
    powershell -File forward-raw-print.ps1 -PrinterName "EPSON TM-T20" -FilePath "C:\temp\comanda.raw"
#>
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $FilePath)) {
    Write-Error "Arquivo nao encontrado: $FilePath"
    exit 1
}

# Verifica se a impressora existe.
$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
    Write-Error "Impressora nao encontrada: $PrinterName"
    exit 1
}

# Le o arquivo e envia como raw via porta da impressora.
# Enviar via spooler "raw" usa a API de job do Windows sem transformar o payload.
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$jobName = "iFood QR - " + (Get-Date -Format 'yyyyMMddHHmmss')

# RawDataObject: envia bytes diretamente para a impressora.
$success = $false
try {
    $rawData = [System.IO.File]::ReadAllBytes($FilePath)

    # Usa a API do spooler via .NET (RawPrinterHelper-like) para modo raw.
    $printerPath = "\\" + $env:COMPUTERNAME + "\" + $PrinterName
    # Fallback simples: copia para a porta da impressora usando o spooler.
    # A forma mais confiavel de raw print em PowerShell e via Start-Process de "print" com o driver raw.
    # Aqui usamos Add-Type com a API winspool.drv para OpenPrinter/StartDocPrinter/WritePrinter.
    Add-Type -Namespace Win32 -Name PrintSpooler -MemberDefinition @'
[DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool ClosePrinter(IntPtr hPrinter);
[DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOC_INFO_1 di);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool EndDocPrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool StartPagePrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool EndPagePrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct DOC_INFO_1 { public string pDocName; public string pOutputFile; public string pDataType; }
'@

    $di = New-Object Win32.PrintSpooler+DOC_INFO_1
    $di.pDocName = $jobName
    $di.pDataType = "RAW"

    $hPrinter = [IntPtr]::Zero
    $opened = [Win32.PrintSpooler]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)
    if (-not $opened -or $hPrinter -eq [IntPtr]::Zero) {
        throw "OpenPrinter falhou para '$PrinterName'"
    }

    try {
        [Win32.PrintSpooler]::StartDocPrinter($hPrinter, 1, [ref]$di) | Out-Null
        [Win32.PrintSpooler]::StartPagePrinter($hPrinter) | Out-Null
        $written = 0
        [Win32.PrintSpooler]::WritePrinter($hPrinter, $rawData, $rawData.Length, [ref]$written) | Out-Null
        [Win32.PrintSpooler]::EndPagePrinter($hPrinter) | Out-Null
        [Win32.PrintSpooler]::EndDocPrinter($hPrinter) | Out-Null
        $success = $true
    }
    finally {
        [Win32.PrintSpooler]::ClosePrinter($hPrinter) | Out-Null
    }
}
catch {
    Write-Error "Falha ao enviar raw para '$PrinterName': $($_.Exception.Message)"
    exit 1
}

if ($success) {
    Write-Output "OK: raw enviado para '$PrinterName' ($($bytes.Length) bytes)"
    exit 0
}

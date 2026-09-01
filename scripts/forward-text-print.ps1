#Requires -Version 5.1
<#
.SYNOPSIS
    Envia um arquivo de texto para uma impressora, em modo texto (TEXT),
    util para Microsoft Print to PDF durante testes.

.EXAMPLE
    powershell -File forward-text-print.ps1 -PrinterName "Microsoft Print to PDF" -FilePath "C:\temp\comanda.txt"
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

$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
    Write-Error "Impressora nao encontrada: $PrinterName"
    exit 1
}

try {
    # O modo TEXT usa o spooler com tipo de dado "TEXT".
    $text = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
    $tmp = [System.IO.Path]::GetTempFileName() + ".txt"
    [System.IO.File]::WriteAllText($tmp, $text)

    $jobName = "iFood QR - " + (Get-Date -Format 'yyyyMMddHHmmss')

    Add-Type -Namespace Win32 -Name PrintSpoolerText -MemberDefinition @'
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

    $di = New-Object Win32.PrintSpoolerText+DOC_INFO_1
    $di.pDocName = $jobName
    $di.pDataType = "TEXT"

    $hPrinter = [IntPtr]::Zero
    $opened = [Win32.PrintSpoolerText]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)
    if (-not $opened -or $hPrinter -eq [IntPtr]::Zero) {
        throw "OpenPrinter falhou para '$PrinterName'"
    }

    $bytes = [System.Text.Encoding]::GetEncoding('latin1').GetBytes($text)
    try {
        [Win32.PrintSpoolerText]::StartDocPrinter($hPrinter, 1, [ref]$di) | Out-Null
        [Win32.PrintSpoolerText]::StartPagePrinter($hPrinter) | Out-Null
        $written = 0
        [Win32.PrintSpoolerText]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written) | Out-Null
        [Win32.PrintSpoolerText]::EndPagePrinter($hPrinter) | Out-Null
        [Win32.PrintSpoolerText]::EndDocPrinter($hPrinter) | Out-Null
    }
    finally {
        [Win32.PrintSpoolerText]::ClosePrinter($hPrinter) | Out-Null
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }

    Write-Output "OK: texto enviado para '$PrinterName'"
    exit 0
}
catch {
    Write-Error "Falha ao enviar texto para '$PrinterName': $($_.Exception.Message)"
    exit 1
}

#Requires -Version 5.1
<#
.SYNOPSIS
    Envia texto plano para impressora (Microsoft Print to PDF, etc.) via datatype TEXT.
#>
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $FilePath)) {
    Write-Error "Arquivo nao encontrado: $FilePath"
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class TextPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void Send(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed: " + printerName);

        try {
            var di = new DOCINFO {
                pDocName = "iFood QR Bridge",
                pDatatype = "TEXT"
            };
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter failed");
            try {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter failed");
                IntPtr ptr = Marshal.AllocCoTaskMem(bytes.Length);
                try {
                    Marshal.Copy(bytes, 0, ptr, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, ptr, bytes.Length, out written))
                        throw new Exception("WritePrinter failed");
                } finally {
                    Marshal.FreeCoTaskMem(ptr);
                }
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@

$text = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
$bytes = [System.Text.Encoding]::GetEncoding(28591).GetBytes($text)
[TextPrinter]::Send($PrinterName, $bytes)
Write-Host "[forward-text-print] OK -> $PrinterName ($($bytes.Length) bytes TEXT)"

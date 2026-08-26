#Requires -Version 5.1
<#
.SYNOPSIS
    Captura bytes RAW de um job na fila Windows, cancela o job e grava em arquivo.

.NOTES
    Requer PowerShell Admin (leitura de C:\Windows\System32\spool\PRINTERS).
#>
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][int]$JobId,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'

function Find-SplForJob {
    param(
        [string]$Printer,
        [int]$Id
    )

    $dir = Join-Path $env:windir 'System32\spool\PRINTERS'
    if (-not (Test-Path $dir)) {
        return $null
    }

    $candidates = @()
    foreach ($shd in Get-ChildItem -Path $dir -Filter '*.SHD' -ErrorAction SilentlyContinue) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($shd.FullName)
        } catch {
            continue
        }

        $unicode = [System.Text.Encoding]::Unicode.GetString($bytes)
        if ($unicode -notlike "*$Printer*") {
            continue
        }

        $jobMatch = $false
        foreach ($off in @(0x40, 0x44, 0x48, 0x4C, 0x50, 0x54, 0x58, 0x5C, 0x60)) {
            if ($bytes.Length -gt ($off + 4)) {
                $foundId = [BitConverter]::ToUInt32($bytes, $off)
                if ([int]$foundId -eq $Id) {
                    $jobMatch = $true
                    break
                }
            }
        }

        $spl = [System.IO.Path]::ChangeExtension($shd.FullName, '.SPL')
        if (-not (Test-Path $spl)) {
            continue
        }

        $candidates += [PSCustomObject]@{
            SplPath   = $spl
            ShdPath   = $shd.FullName
            JobMatch  = $jobMatch
            WriteTime = (Get-Item $spl).LastWriteTime
            Size      = (Get-Item $spl).Length
        }
    }

    if ($candidates.Count -eq 0) {
        return $null
    }

    $matched = @($candidates | Where-Object { $_.JobMatch } | Sort-Object WriteTime -Descending)
    if ($matched.Count -gt 0) {
        return $matched[0].SplPath
    }

    $recent = @($candidates | Sort-Object WriteTime -Descending)
    return $recent[0].SplPath
}

function Extract-RawPayload {
    param([byte[]]$Bytes)

    if ($Bytes.Length -eq 0) {
        return $Bytes
    }

    # ESC/POS: comeca em ESC (0x1B)
    for ($i = 0; $i -lt ($Bytes.Length - 4); $i++) {
        if ($Bytes[$i] -eq 0x1B) {
            return $Bytes[$i..($Bytes.Length - 1)]
        }
    }

    # Texto ASCII legivel
    for ($i = 0; $i -lt ($Bytes.Length - 8); $i++) {
        if ($Bytes[$i] -ge 0x20 -and $Bytes[$i] -le 0x7E) {
            $run = 0
            for ($j = $i; $j -lt [Math]::Min($Bytes.Length, $i + 32); $j++) {
                $b = $Bytes[$j]
                if (($b -ge 0x20 -and $b -le 0x7E) -or $b -eq 0x0A -or $b -eq 0x0D) {
                    $run++
                } else {
                    break
                }
            }
            if ($run -ge 12) {
                return $Bytes[$i..($Bytes.Length - 1)]
            }
        }
    }

    # Cabecalho SPL tipico: pular bloco inicial
    foreach ($skip in @(512, 1024, 2048, 4096)) {
        if ($Bytes.Length -gt ($skip + 64)) {
            return $Bytes[$skip..($Bytes.Length - 1)]
        }
    }

    return $Bytes
}

Start-Sleep -Milliseconds 600

$splPath = Find-SplForJob -Printer $PrinterName -Id $JobId
if (-not $splPath) {
    @{
        ok    = $false
        error = "SPL nao encontrado para job $JobId em $PrinterName"
    } | ConvertTo-Json -Compress
    exit 1
}

$splBytes = [System.IO.File]::ReadAllBytes($splPath)
$rawBytes = Extract-RawPayload -Bytes $splBytes

$outDir = Split-Path -Parent $OutputPath
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
[System.IO.File]::WriteAllBytes($OutputPath, $rawBytes)

try {
    Remove-PrintJob -PrinterName $PrinterName -ID $JobId -ErrorAction Stop
    $cancelled = $true
} catch {
    $cancelled = $false
}

@{
    ok         = $true
    rawPath    = $OutputPath
    splPath    = $splPath
    bytes      = $rawBytes.Length
    splBytes   = $splBytes.Length
    cancelled  = $cancelled
    printer    = $PrinterName
    jobId      = $JobId
} | ConvertTo-Json -Compress

#Requires -Version 5.1
<#
.SYNOPSIS
    Captura o stream raw (ESC/POS) de um job na fila Windows, cancela o job
    e grava o conteúdo em um arquivo.

.DESCRIPTION
    Com a impressora virtual usando driver "Generic / Text Only" + PORTPROMPT,
    o arquivo .SPL no spool contem o stream raw ESC/POS diretamente (sem EMF).
    Este script apenas localiza o .SPL do job e copia seus bytes, sem tentar
    extrair/decodificar o payload — eliminando o parse binario fragil da versao
    anterior.

    O job e entao cancelado na fila virtual para nao imprimir em duplicidade
    (o servico reencaminha o raw enriquecido para a impressora fisica).

.EXAMPLE
    powershell -File capture-print-job.ps1 -PrinterName "iFood QR Bridge" -JobId 7 -OutputPath "C:\temp\job.raw"
#>
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][int]$JobId,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'

function Find-SplForPrinter {
    param([string]$Printer)

    $dir = Join-Path $env:windir 'System32\spool\PRINTERS'
    if (-not (Test-Path $dir)) {
        return $null
    }

    $best = $null
    foreach ($shd in Get-ChildItem -Path $dir -Filter '*.SHD' -ErrorAction SilentlyContinue) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($shd.FullName)
        } catch {
            continue
        }

        $unicode = [System.Text.Encoding]::Unicode.GetString($bytes)
        $ascii  = [System.Text.Encoding]::ASCII.GetString($bytes)
        if ($unicode -notlike "*$Printer*" -and $ascii -notlike "*$Printer*") {
            continue
        }

        $spl = [System.IO.Path]::ChangeExtension($shd.FullName, '.SPL')
        if (-not (Test-Path $spl)) {
            continue
        }

        $item = Get-Item $spl
        if ($null -eq $best -or $item.LastWriteTime -gt $best.LastWriteTime) {
            $best = $item
        }
    }

    if ($null -ne $best) {
        return $best.FullName
    }
    return $null
}

try {
    $splPath = Find-SplForPrinter -Printer $PrinterName

    if (-not $splPath) {
        Write-Output (ConvertTo-Json -Compress @{ ok = $false; error = "SPL nao encontrado para '$PrinterName'" })
        exit 1
    }

    # Copia os bytes crus do SPL (stream ESC/POS) para o OutputPath.
    [System.IO.File]::Copy($splPath, $OutputPath, $true)
    $splBytes = (Get-Item $OutputPath).Length

    # Cancela o job na fila virtual para nao imprimir em duplicidade.
    $cancelled = $false
    try {
        Remove-PrintJob -PrinterName $PrinterName -ID $JobId -ErrorAction Stop
        $cancelled = $true
    } catch {
        # O job pode ja ter sido removido; nao e fatal.
    }

    Write-Output (ConvertTo-Json -Compress @{
        ok        = $true
        splPath   = $splPath
        splBytes  = $splBytes
        cancelled = $cancelled
    })
    exit 0
}
catch {
    Write-Output (ConvertTo-Json -Compress @{ ok = $false; error = $_.Exception.Message })
    exit 1
}

#Requires -Version 5.1
<#
.SYNOPSIS
    Lista jobs pendentes na fila de uma impressora (por nome), em JSON.
    Usado pelo queue-watcher.ts para detectar novas impressoes.
.EXAMPLE
    powershell -File get-print-jobs.ps1 -PrinterName "iFood QR Bridge"
#>
param(
    [Parameter(Mandatory = $true)][string]$PrinterName
)

$ErrorActionPreference = 'SilentlyContinue'

$jobs = Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue

if (-not $jobs) {
    Write-Output '[]'
    exit 0
}

$result = @()
foreach ($j in $jobs) {
    $result += [PSCustomObject]@{
        Id            = [int]$j.Id
        DocumentName  = [string]$j.DocumentName
        JobStatus     = [string]$j.JobStatus
        Size          = [int]$j.Size
        SubmittedTime = [string]$j.SubmittedTime
    }
}

Write-Output ($result | ConvertTo-Json -Compress)

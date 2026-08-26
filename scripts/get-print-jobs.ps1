#Requires -Version 5.1
<#
.SYNOPSIS
    Lista jobs na fila de uma impressora (JSON).
#>
param(
    [Parameter(Mandatory = $true)][string]$PrinterName
)

$ErrorActionPreference = 'SilentlyContinue'

$jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
if ($jobs.Count -eq 0) {
    Write-Output '[]'
    exit 0
}

$list = @()
foreach ($job in $jobs) {
    $list += @{
        Id            = [int]$job.Id
        DocumentName  = [string]$job.DocumentName
        JobStatus     = [string]$job.JobStatus
        Size          = [int]$job.Size
        SubmittedTime = $job.SubmittedTime.ToString('o')
    }
}

$list | ConvertTo-Json -Compress

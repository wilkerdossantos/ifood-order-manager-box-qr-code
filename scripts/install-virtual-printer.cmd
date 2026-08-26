@echo off
REM Wrapper CMD — use no Prompt de Comando ou Explorer (nao use bash/sh).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-virtual-printer.ps1" %*

# Configuration Reference

Config file: `%ProgramData%\iFoodQrService\config.json`

## Core

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Master switch for QR enrichment |
| `healthPort` | `7420` | HTTP API port (`/health`, `/print/enrich`, etc.) |
| `cachePath` | `%ProgramData%\iFoodQrService\cache.json` | Persisted order cache |
| `logLevel` | `info` | Service log level |
| `logPath` | `%ProgramData%\iFoodQrService\logs` | Log directory |

## Order capture (CDP)

| Key | Default | Description |
|-----|---------|-------------|
| `cdpPrintHookEnabled` | `false` | **Keep false** for Desktop — use ipcHandler hook |
| `ingestUrlPattern` | see types.ts | Regex for URLs to ingest via CDP |

CDP port is fixed at `9222` via Gestor launch args (not in config.json).

## Print / QR

| Key | Default | Description |
|-----|---------|-------------|
| `pdfMode` | `false` | Global PDF mode; per-printer detection also applies |
| `targetPrinterName` | `Microsoft Print to PDF` | Printer name that triggers PDF-safe QR text |
| `printCacheWaitMs` | `2000` | Wait for cache entry before giving up on enrich |
| `printDebugEnabled` | `true` | Write debug artifacts on print |
| `printDebugDir` | `%ProgramData%\...\spool\debug` | Debug output directory |

Preview files: `%ProgramData%\iFoodQrService\print-preview\`

## Deprecated / inactive for Desktop

| Key | Description |
|-----|-------------|
| `proxyPort` | Legacy HTTPS proxy — not used for Desktop |
| `proxyHosts` | Legacy proxy host list |
| `spoolWatchEnabled` | Spooler watcher — deprecated |
| `printQueueWatchEnabled` | Queue watcher — deprecated |
| `pipeName` | Named pipe bridge — deprecated |

See [ADR-004](../adr/004-deprecated-approaches.md).

## Environment variables (hooks)

| Variable | Description |
|----------|-------------|
| `IFOOD_QR_HEALTH_PORT` | Override enrich CLI target port (default 7420) |
| `IFOOD_QR_SCRIPTS_DIR` | Override scripts directory for enrich-cli |
| `IFOOD_QR_CONFIG` | Override config.json path |
| `ELECTRON_RUN_AS_NODE` | Set by hooks when spawning enrich-cli from Electron |

## Example minimal config

```json
{
  "enabled": true,
  "healthPort": 7420,
  "cdpPrintHookEnabled": false,
  "cachePath": "C:\\ProgramData\\iFoodQrService\\cache.json",
  "targetPrinterName": "Microsoft Print to PDF"
}
```

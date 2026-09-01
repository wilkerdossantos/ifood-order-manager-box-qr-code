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
<<<<<<< HEAD
| `cdpEnabled` | `true` | Enable CDP order capture |
| `cdpPort` | `9222` | Gestor debug port (set via launch args) |
| `cdpReconnectSeconds` | `8` | Reconnect interval |
| `ingestUrlPattern` | see types.ts | Regex for URLs to ingest via CDP |

=======
| `cdpPrintHookEnabled` | `false` | **Keep false** for Desktop — use ipcHandler hook |
| `ingestUrlPattern` | see types.ts | Regex for URLs to ingest via CDP |

CDP port is fixed at `9222` via Gestor launch args (not in config.json).

>>>>>>> origin/main
## Print / QR

| Key | Default | Description |
|-----|---------|-------------|
| `pdfMode` | `false` | Global PDF mode; per-printer detection also applies |
<<<<<<< HEAD
| `printerName` | `iFood QR Bridge` | Virtual printer that captures the print |
| `targetPrinterName` | `""` | Physical destination printer (thermal) |
| `printFileWatchEnabled` | `false` | Watch `output.prn` (set by `configure-bridge.ps1`) |
| `spoolDir` | `%ProgramData%\...\spool` | Spool directory holding `output.prn` |
| `printCacheWaitMs` | `2000` | Wait for cache entry before giving up on enrich |
| `printPreviewEnabled` | `true` | Write readable copy of each enriched comanda |
| `printPreviewDir` | `%ProgramData%\...\print-preview` | Preview output directory |
| `printDebugEnabled` | `true` | Write debug dumps (raw/readable/enriched) |
| `printDebugDir` | `%ProgramData%\...\spool\debug` | Debug output directory |
| `cacheMaxAgeHours` | `24` | Cache TTL in hours (0 = no expiry) |

Preview files: `%ProgramData%\iFoodQrService\print-preview\`

=======
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

>>>>>>> origin/main
## Example minimal config

```json
{
  "enabled": true,
  "healthPort": 7420,
<<<<<<< HEAD
  "cdpEnabled": true,
  "cdpPort": 9222,
  "printerName": "iFood QR Bridge",
  "targetPrinterName": "Microsoft Print to PDF",
  "printFileWatchEnabled": true
=======
  "cdpPrintHookEnabled": false,
  "cachePath": "C:\\ProgramData\\iFoodQrService\\cache.json",
  "targetPrinterName": "Microsoft Print to PDF"
>>>>>>> origin/main
}
```

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
| `cdpEnabled` | `true` | Enable CDP order capture |
| `cdpPort` | `9222` | Gestor debug port (set via launch args) |
| `cdpReconnectSeconds` | `8` | Reconnect interval |
| `ingestUrlPattern` | see types.ts | Regex for URLs to ingest via CDP |

## Print / QR

| Key | Default | Description |
|-----|---------|-------------|
| `pdfMode` | `false` | Global PDF mode; per-printer detection also applies |
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

## Example minimal config

```json
{
  "enabled": true,
  "healthPort": 7420,
  "cdpEnabled": true,
  "cdpPort": 9222,
  "printerName": "iFood QR Bridge",
  "targetPrinterName": "Microsoft Print to PDF",
  "printFileWatchEnabled": true
}
```

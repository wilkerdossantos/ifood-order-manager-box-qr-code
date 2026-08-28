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
| `printCacheWaitMs` | `2000` | Wait for cache entry before giving up on enrich |
| `printPreviewEnabled` | `true` | Write readable copy of each enriched comanda |
| `printPreviewDir` | `%ProgramData%\...\print-preview` | Preview output directory |
| `cacheMaxAgeHours` | `24` | Cache TTL in hours (0 = no expiry) |

Preview files: `%ProgramData%\iFoodQrService\print-preview\`

## Environment variables (hooks)

| Variable | Description |
|----------|-------------|
| `IFOOD_QR_HEALTH_PORT` | Override enrich CLI target port (default 7420) |
| `IFOOD_QR_SCRIPTS_DIR` | Override scripts directory for enrich-cli |
| `ELECTRON_RUN_AS_NODE` | Set by hooks when spawning enrich-cli from Electron |

## Example minimal config

```json
{
  "enabled": true,
  "healthPort": 7420,
  "cdpEnabled": true,
  "cdpPort": 9222
}
```

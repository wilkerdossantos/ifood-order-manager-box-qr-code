# ADR-004: Deprecated / Legacy Approaches

## Status

Accepted (2026-08-28)

## Context

The repository accumulated multiple parallel strategies from experimentation. Only the Gestor Desktop path (ADR-001 + ADR-003) is maintained.

## Deprecated approaches

| Approach | Location | Why deprecated |
|----------|----------|----------------|
| **Impressora GP iFood widget** (port 4013) | `setup-printer-widget-patch.ps1`, `printer-widget-print-hook.cjs` | Browser-only; not used by Gestor Desktop Electron |
| **CDP renderer print hook** | `cdp-collector.ts` (`cdpPrintHookEnabled`) | v2 prints EscPos arrays via IPC; hook only queued strings |
| **print-main-hook.cjs** (ipcMain wrapper) | `scripts/print-main-hook.cjs` | Never injected into `main.mjs`; superseded by ipcHandler patch |
| **Windows HTTPS proxy** | `proxy-interceptor.ts`, `configure-portprompt-mode.ps1` | Breaks Desktop; user rejected |
| **Spooler / queue watchers** | `spool-watcher.ts`, `queue-watcher.ts`, `raw-forwarder.ts` | Raw spool jobs don't contain structured order IDs reliably |
| **RedMon / virtual printer / print bridge driver** | `install-virtual-printer.ps1`, `PRINT-BRIDGE-DRIVER.md` | Superseded by ipcHandler hook |
| **Port 4013 HTTP bridge in service** | `bridge-server.ts` | Widget-specific |

## What to use instead

See `docs/spec/gestor-desktop-integration.md` — the single supported happy path.

## Script markers

Deprecated scripts include a header pointing to this ADR and may `exit 1` when invoked from main setup flow.

## Consequences

- Legacy code may remain for reference but must not appear in setup instructions or startup banners.
- New work must not reintroduce widget/proxy/spooler paths without a new ADR.

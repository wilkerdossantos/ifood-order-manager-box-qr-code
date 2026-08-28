# ADR-003: Print Interception Strategy

## Status

Accepted (2026-08-28)

## Context

Gestor Desktop (Electron) prints comandas as ESC/POS streams. We need to intercept
the print, inject a QR code, and forward the enriched stream to a physical thermal
printer — without modifying the iFood app.

Two approaches were evaluated:

### A. Hook in the Electron main process (rejected)

Patch `main.mjs` / `ipcHandler.js` of the unpacked `app.asar` to wrap
`thermal-printer.print`. Injected a `installThermalPrinterHook` call that enriched
the invoice before printing.

**Why it failed:** the patched `main.mjs` was never loaded by the Electron runtime.
Even with `--app-path` pointing at the unpacked directory, a correct deploy, and a
fresh process restart, the injected module never executed (no log line, no hook
side effect). Patching Electron internals proved too fragile to rely on.

### B. Virtual printer with FILE: port (accepted)

Install a virtual printer "iFood QR Bridge" using the `Generic / Text Only` driver
and a fixed **FILE:** port pointing at `spool/output.prn`. The Windows spooler then
writes the raw ESC/POS stream directly to that file — no job in the print queue, no
interactive prompt (PORTPROMPT was tried first and leaves an empty SPL because it
prompts for a filename).

The service monitors `output.prn` (size/mtime polling), reads the raw stream, extracts
the display ID from the printable text (`PEDIDO: #0011`), looks up the order in the
cache (populated via CDP), injects the QR, and forwards to the physical printer.

## Decision

**Use the virtual printer with a FILE: port + file watcher.**

```
Gestor → "iFood QR Bridge" (Generic/Text Only, FILE: spool/output.prn)
        → file-watcher reads raw ESC/POS
        → extract displayId → cache lookup (CDP) → inject QR
        → forward (raw ESC/POS to thermal, or text to PDF for testing)
```

## Configuration

- `printerName` — virtual printer name (default `iFood QR Bridge`)
- `targetPrinterName` — physical destination printer
- `printFileWatchEnabled` — enables the file watcher (set by `configure-bridge.ps1`)

## Consequences

- `[FILE] Arquivo de impressao detectado` when a new print lands in `output.prn`.
- `[IMPRESSÃO] QR adicionado à comanda` when the QR is injected.
- `[PRINT] Comanda encaminhada` when the stream is forwarded.
- Order must be in cache (via CDP) and display ID extractable from the raw text.
- Requires the virtual printer to be installed once (`install-virtual-printer.ps1`).

# ADR-003: Print Interception Strategy

## Status

Accepted (2026-08-28)

## Context

<<<<<<< HEAD
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
=======
Gestor Desktop sets `ELECTRON_PRINTER_VERSION: "2"` and prints via:

```
Renderer (isElectron=true)
  → ElectronActions.printInvoice()
  → ipcRenderer.send("printOrder", escPosArray, printer, manufacturer, columns, fontSize)
  → Main: ipcHandler.js
  → @ifood/thermal-printer.print(escPosArray, options)
```

Gestor **Browser** (not our target) uses HTTP `POST http://localhost:4013/print` via the Impressora GP widget.

Prior attempts failed because:

1. CDP print hook only intercepted **string** invoices; v2 sends **EscPos JSON arrays**.
2. Preload hook had the same string-only limitation.
3. `extractDisplayIdFromInvoice` only matched `PEDIDO: #NNNN`, not Gestor v2 labels like `NÚMERO DO PEDIDO: #1234` or standalone `shortReference`.
4. `print-main-hook.cjs` (ipcMain wrapper) was never loaded by `main.mjs`.

## Decision

**Hook at `ipcHandler.js` in the Gestor main process** (patched unpacked app):

```javascript
const finalInvoice = enrichPrintInvoice(invoice, printerName);
iFoodThermalPrinter.print(finalInvoice, { ... });
```

`enrichPrintInvoice` (in `ifood-qr-ipc-hook.mjs`):

1. Extracts plain text from string or EscPos array invoice.
2. Calls local service `POST /print/enrich` via `enrich-cli.cjs` (spawnSync + `ELECTRON_RUN_AS_NODE`).
3. Appends QR as `qrCode` item (thermal) or text block (PDF mode) to EscPos array.

Secondary fallback: preload hook (`gestor-preload-hook.mjs`) with same EscPos array support.

Deployment: `setup-gestor-patch.ps1` → `%ProgramData%/iFoodQrService/gestor-unpacked` + `--app-path=` on Gestor launch.

## Configuration

- `cdpPrintHookEnabled: false` — CDP print hook disabled; main-process hook is authoritative.

## Consequences

- `[IMPRESSÃO] QR adicionado` appears in `npm run dev` when `/print/enrich` succeeds.
- `[iFood QR] Impressao interceptada` appears in Gestor main process logs.
- Order must be in cache **and** display ID must be extractable from invoice text.
>>>>>>> origin/main

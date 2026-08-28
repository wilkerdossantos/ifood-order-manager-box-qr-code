# ADR-003: Print Interception Strategy

## Status

Accepted (2026-08-28)

## Context

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

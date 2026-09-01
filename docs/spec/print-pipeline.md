# Print Pipeline

<<<<<<< HEAD
## Gestor Desktop → virtual printer → file watcher

```
Gestor Desktop (Electron)
  → print comanda (ESC/POS stream)
  → impressora "iFood QR Bridge" (Generic / Text Only, porta FILE:)
  → spooler grava em C:\ProgramData\iFoodQrService\spool\output.prn
  → file-watcher detecta mudança (size/mtime)
  → lê raw ESC/POS, extrai displayId ("PEDIDO: #0011")
  → consulta cache (populado via CDP)
  → injeta QR (ESC/POS raw p/ térmica, ou texto p/ PDF)
  → reencaminha p/ targetPrinterName
```

## Text extraction

O raw ESC/POS usa driver "Generic / Text Only", então o texto da comanda é
legível no stream (não há EMF). A extração do displayId usa:

- `PEDIDO: #NNNN`
- `NÚMERO DO PEDIDO: #NNNN`
- `shortReference` standalone (v2)

## Enrichment
=======
## Gestor Desktop (ELECTRON_PRINTER_VERSION 2)

Confirmed flow from Gestor web bundle analysis:

```
onPrintOrder (redux saga)
  → Fa(..., isElectron=true)
  → ElectronActions.printInvoice(invoiceBuilder, printerConfig)
  → invoice.getPrintables()  → EscPos JSON array
  → ipcRenderer.send("printOrder", array, printer, manufacturer, columns, fontSize)
  → ipcHandler.js
       iFoodThermalPrinter.print(array, options)   ← patched at startup
  → installThermalPrinterHook (main.mjs)
       enrichPrintInvoiceAsync(array, printerName)
         → HTTP POST /print/enrich (sem spawnSync)
         → append qrCode or PDF text item
       origPrint(enrichedArray, options)
  → Windows spooler / Print to PDF
```

## Gestor Browser (NOT supported here)

When `isElectron=false`, the same saga calls:

```
POST http://localhost:4013/print
  → Impressora GP iFood widget
```

This path is **deprecated** for this project (ADR-001, ADR-004).

## Invoice text extraction

EscPos arrays contain typed items (`text`, `leftright`, `customTable`, etc.). The hook flattens these to plain text for order lookup.

Gestor v2 invoice labels:

- Large centered `shortReference` (e.g. `3676817`)
- `NÚMERO DO PEDIDO: #3676817`

Legacy label `PEDIDO: #6798` still supported.

## Enrichment endpoint
>>>>>>> origin/main

`POST http://127.0.0.1:7420/print/enrich`

```json
<<<<<<< HEAD
{ "invoice": "texto extraído", "printerName": "Microsoft Print to PDF" }
```

Resposta quando o pedido está no cache:
=======
{
  "invoice": "plain text extracted from comanda",
  "printerName": "Microsoft Print to PDF"
}
```

Response when matched:
>>>>>>> origin/main

```json
{
  "ok": true,
  "modified": true,
<<<<<<< HEAD
  "payload": "LOJA:...|NP:0011|...",
  "pdfMode": true,
  "invoice": "... texto enriquecido com QR ..."
}
```

Para impressora térmica (`pdfMode=false`), o QR é injetado como bytes ESC/POS
(`generateEscPosQr`). Para PDF/texto (`pdfMode=true`), como bloco de texto legível.

## Log correlation

| Local | Mensagem |
|-------|----------|
| npm run dev | `[FILE] Arquivo de impressao detectado` |
| npm run dev | `[QUEUE] Job de impressao detectado` |
| npm run dev | `[IMPRESSÃO] QR adicionado à comanda` |
| npm run dev | `[PRINT] Comanda encaminhada` |

Se `[QUEUE]` aparece mas `[IMPRESSÃO]` não, o enriquecimento retornou
`modified: false` (pedido não no cache ou ID não extraído).

## Test

```powershell
npm run dev   # precisa estar rodando

# Teste direto do endpoint
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:7420/print/enrich `
  -ContentType application/json `
  -Body '{"invoice":"PEDIDO: #0011","printerName":"Microsoft Print to PDF"}'
=======
  "payload": "LOJA:...|NP:3676817|...",
  "pdfMode": true,
  "invoice": "... enriched plain text ..."
}
```

For EscPos arrays, the IPC hook uses `payload` + `pdfMode` to append QR items to the array (plain `invoice` string is for string-mode prints).

## Log correlation

| Location | Message |
|----------|---------|
| npm run dev | `[IMPRESSÃO] QR adicionado à comanda` |
| `%ProgramData%\iFoodQrService\logs\print-hook.log` | `[iFood QR] print recebido` / `QR adicionado` |
| Gestor main console | same as print-hook.log |
| thermal-printer | `Printing content with EscPos on printer: ...` |

If thermal-printer logs appear but `[IMPRESSÃO]` does not, enrichment returned `modified: false` (order not found or ID not extracted).

## Test scripts

```powershell
npm run dev   # must be running

# Simulate IPC print with known order
node scripts/test-escpos-print.mjs

# Direct API test
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:7420/print/enrich `
  -ContentType application/json `
  -Body '{"invoice":"NÚMERO DO PEDIDO: #3676817","printerName":"Microsoft Print to PDF"}'
>>>>>>> origin/main
```

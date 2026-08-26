# Print Bridge — Impressora Virtual (Windows 11, sem RedMon)

RedMon [nao suporta Windows 10/11](https://www.ghostgum.com.au/software/redmon.htm).

## Modo A — PORTPROMPT + Microsoft Print to PDF (Windows 11)

Quando Generic/Text nao esta disponivel, use esta configuracao:

```
Gestor Desktop
    |  imprime em "iFood QR Bridge" (PORTPROMPT + PDF driver)
    v
Fila Windows (SPL/SHD em spool\PRINTERS)
    |  PrintQueueWatcher detecta job
    v
capture-print-job.ps1 (captura bytes, cancela job na Bridge)
    |  enrichInvoice + debug txt
    v
targetPrinterName (TEXT se PDF, RAW se termica)
```

```powershell
# Admin obrigatorio (leitura de C:\Windows\System32\spool\PRINTERS)
npm run install:virtual-printer -- -TargetPrinter "Microsoft Print to PDF" -UsePortPrompt
npm run dev
```

## Modo B — Porta arquivo (Generic / Text Only)

```
Porta local: C:\ProgramData\iFoodQrService\spool\output.prn
    -> SpoolWatcher
```

## Config (`config.json`)

```json
{
  "printerName": "iFood QR Bridge",
  "targetPrinterName": "Microsoft Print to PDF",
  "printQueueWatchEnabled": true,
  "spoolWatchEnabled": true,
  "printDebugEnabled": true,
  "spoolDir": "C:\\ProgramData\\iFoodQrService\\spool"
}
```

## Verificar

```powershell
curl http://127.0.0.1:7420/diagnostics
# queue.enabled=true, queue.jobsProcessed incrementa apos imprimir
curl http://127.0.0.1:7420/print/debug
```

## Troubleshooting

| Sintoma | Solucao |
|---------|---------|
| `[QUEUE]` nao aparece | `npm run dev` como **Admin**? Gestor usa "iFood QR Bridge"? |
| `SPL nao encontrado` | Executar servico como Administrador |
| QR nao adicionado | Pedido capturado via CDP antes de imprimir? Veja `*-meta.json` |
| PDF ilegivel / binario | `targetPrinterName` deve conter "PDF" — envia TEXT, nao ESC/POS |
| Dialogo PORTPROMPT aparece | Job nao foi cancelado — confirme Admin + `[QUEUE]` nos logs |

## Debug

Arquivos em `C:\ProgramData\iFoodQrService\spool\debug\`:

- `*-readable.txt` — comanda legivel
- `*-enriched.txt` — com QR (texto se PDF)
- `*-meta.json` — modified, payload, cache

## Captura de pedidos

Ainda requer CDP (`enable-gestor-debug.ps1`) ou ingest manual para popular o cache antes da impressao.

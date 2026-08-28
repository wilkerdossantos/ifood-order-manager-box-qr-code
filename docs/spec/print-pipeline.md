# Print Pipeline

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

`POST http://127.0.0.1:7420/print/enrich`

```json
{ "invoice": "texto extraído", "printerName": "Microsoft Print to PDF" }
```

Resposta quando o pedido está no cache:

```json
{
  "ok": true,
  "modified": true,
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
```

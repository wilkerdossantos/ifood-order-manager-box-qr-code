# Print Bridge — Impressora Virtual (Windows 11, sem RedMon)

RedMon [nao suporta Windows 10/11](https://www.ghostgum.com.au/software/redmon.htm). Usamos **porta local -> arquivo** + **SpoolWatcher** no servico.

## Fluxo

```
Gestor Desktop
    |  imprime em "iFood QR Bridge"
    v
Porta local: C:\ProgramData\iFoodQrService\spool\output.prn
    |  chokidar detecta alteracao
    v
SpoolWatcher (servico Node)
    |  enrichInvoice + forward RAW
    v
Impressora destino (ex: Microsoft Print to PDF, EPSON TM-T20)
```

## Instalacao

```powershell
# Admin
npm run install:virtual-printer -- -TargetPrinter "Microsoft Print to PDF"

npm run dev
```

No Gestor: **Configuracoes -> Impressora -> iFood QR Bridge**

## Config (`config.json`)

```json
{
  "printerName": "iFood QR Bridge",
  "targetPrinterName": "Microsoft Print to PDF",
  "spoolWatchEnabled": true,
  "spoolDir": "C:\\ProgramData\\iFoodQrService\\spool"
}
```

## Verificar

```powershell
# Diagnostico
curl http://127.0.0.1:7420/diagnostics

# Deve mostrar spool.enabled=true, jobsProcessed incrementando apos imprimir
```

## Troubleshooting

| Sintoma | Solucao |
|---------|---------|
| `[SPOOL]` nao aparece | `npm run dev` rodando? Gestor usa "iFood QR Bridge"? |
| QR nao adicionado | Pedido capturado via CDP antes de imprimir? |
| Driver Generic nao existe | Rodar install script como Admin; ou instalar driver manualmente |
| PDF ilegivel | `targetPrinterName` deve conter "PDF" para modo texto |

## Captura de pedidos

Ainda requer CDP (`enable-gestor-debug.ps1`) ou ingest manual para popular o cache antes da impressao.

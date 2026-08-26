# Print Bridge — Gestor Desktop (Windows 11)

## Caminho recomendado: hook IPC (sem RedMon, sem impressora virtual)

O Gestor Desktop é Electron. A solução nativa intercepta `printOrder` no **processo principal** antes do spooler Windows:

```
Gestor Desktop (--require print-main-hook.cjs)
    │  ipcMain printOrder(invoice)
    v
print-main-hook.cjs → enrich-cli.cjs → POST /print/enrich (retry 2s)
    │  invoice + QR ESC/POS
    v
Impressora escolhida no Gestor (física ou Microsoft Print to PDF)
```

### Setup

```powershell
npm run dev
npm run enable:gestor
# Abrir Gestor pelo atalho *.ifood-qr.lnk
# Selecionar impressora FÍSICA ou Print to PDF — NÃO "iFood QR Bridge"
```

### Logs esperados

No console do Gestor:

```
[iFood QR] print-main-hook.cjs carregado (porta 7420)
[iFood QR] Interceptação ativa (on → :7420)
[iFood QR] Impressão interceptada → EPSON TM-T20
[iFood QR] QR adicionado — LOJA:...|NP:6798|...
```

No serviço (`npm run dev`):

```
[CDP] Pedido capturado (network)
[CDP] Conectado ao Gestor (multi-target)
```

### Config relevante

```json
{
  "printCacheWaitMs": 2000,
  "printQueueWatchEnabled": false,
  "cdpPrintHookEnabled": false
}
```

`printCacheWaitMs` — tempo de retry se o pedido ainda não estiver no cache no momento da impressão.

---

## Fallback experimental: impressora virtual + fila Windows

RedMon [não suporta Windows 10/11](https://www.ghostgum.com.au/software/redmon.htm).

O modo PORTPROMPT + fila Windows é **experimental** — requer PowerShell Admin, parse frágil de SPL, e conflita com o hook IPC se ambos estiverem ativos.

```
Gestor → "iFood QR Bridge" (PORTPROMPT)
    → PrintQueueWatcher → capture-print-job.ps1
    → enrich → targetPrinterName
```

```powershell
npm run install:virtual-printer -- -TargetPrinter "Microsoft Print to PDF" -UsePortPrompt
npm run configure:portprompt
npm run dev   # Admin
```

Habilite explicitamente:

```json
{
  "printQueueWatchEnabled": true,
  "targetPrinterName": "Microsoft Print to PDF"
}
```

### Troubleshooting (modo experimental)

| Sintoma | Solução |
|---------|---------|
| `[QUEUE]` não aparece | `npm run dev` como **Admin** |
| `SPL nao encontrado` | Admin + impressora virtual correta |
| QR não adicionado | Pedido no cache? `[CDP] Pedido capturado` antes de imprimir |
| Dialogo PORTPROMPT | Job não cancelado — use hook IPC em vez disso |

---

## Named pipe (integrações externas)

```
\\.\pipe\ifood-qr-service
```

Protocolo JSON + newline — ver [README.md](../README.md#print-bridge-named-pipe).

---

## Captura de pedidos

Requer CDP (`enable-gestor-debug.ps1`) — multi-target captura MFEs/webviews do Gestor.

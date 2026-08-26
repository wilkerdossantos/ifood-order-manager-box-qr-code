# Print Bridge — Impressora Virtual Windows

Intercepta a impressão do Gestor Desktop **sem modificar o app iFood**, enriquece com QR e repassa para a impressora física.

## Fluxo

```
Gestor Desktop
    │  ipc printOrder → @ifood/thermal-printer
    ▼
Impressora virtual "iFood QR Bridge"  (driver Generic/Text Only + RedMon)
    │  job RAW/spool
    ▼
print-port-receiver.js  (programa configurado no RedMon)
    │  POST /print/enrich  ou  named pipe
    ▼
iFood QR Service  (cache de pedidos + QR ESC/POS)
    │  comanda enriquecida
    ▼
forward-raw-print.ps1  (Win32 RAW spooler)
    ▼
Impressora física  (ex.: EPSON TM-T20, ou Microsoft Print to PDF para teste)
```

## Por que impressora virtual?

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **CDP + hook renderer** | Rápido para dev | App cacheia IPC; frágil |
| **`--require` main hook** | Funciona hoje | Exige atalho customizado do Gestor |
| **Impressora virtual (este doc)** | Produção estável; parceiro só troca impressora no Gestor | Instalação inicial (RedMon + script) |
| Driver kernel assinado | Mais “nativo” | C++/assinatura WHQL; custo alto |

## Componentes

| Arquivo | Função |
|---------|--------|
| `scripts/install-virtual-printer.ps1` | Cria impressora `iFood QR Bridge` |
| `scripts/print-port-receiver.js` | Recebe job do RedMon, enriquece, encaminha |
| `scripts/forward-raw-print.ps1` | Envia bytes RAW para impressora destino |
| Serviço `:7420` | Cache + `/print/enrich` |
| Named pipe `\\.\pipe\ifood-qr-service` | Alternativa ao HTTP |

## Configuração (`config.json`)

```json
{
  "printerName": "iFood QR Bridge",
  "targetPrinterName": "EPSON TM-T20",
  "printPreviewEnabled": true
}
```

- **`printerName`**: nome que o parceiro seleciona **no Gestor**
- **`targetPrinterName`**: impressora física (ou `Microsoft Print to PDF` para teste)

## Instalação

```powershell
# 1. Serviço rodando
npm run build
npm run dev   # ou install-service.ps1

# 2. Instalar impressora virtual
.\scripts\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF"

# 3. No Gestor → Configurações → Impressora → "iFood QR Bridge"
```

### RedMon (port monitor)

O Windows não redireciona impressão para um programa nativamente. Usamos [RedMon](http://www.redmon.com/) (gratuito):

1. Baixar e instalar RedMon 1.9
2. `install-virtual-printer.ps1` configura a porta `RPT1:` → `print-port-receiver.js`
3. Cada job de impressão executa o receiver com o spool file como argumento

Alternativa futura: port monitor DLL próprio (sem RedMon), se o parceiro não puder instalar software extra.

## Teste manual (sem RedMon)

Simula o que o RedMon faria:

```powershell
Get-Content docs\fixtures\invoice-sample.txt -Raw | node scripts\print-port-receiver.js --stdin
```

Com spool file:

```powershell
node scripts\print-port-receiver.js "C:\Windows\System32\spool\PRINTERS\00001.SPL"
```

## Microsoft Print to PDF

Para validar sem térmica:

```powershell
.\scripts\install-virtual-printer.ps1 -TargetPrinter "Microsoft Print to PDF"
```

O receiver detecta PDF no destino e usa modo texto legível (`pdfMode`). O PDF salvo pelo Windows deve mostrar `QR: LOJA:...|NP:...` no final.

Preview sempre em: `C:\ProgramData\iFoodQrService\print-preview\`

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Comanda sai sem QR | Serviço parado ou pedido não capturado (CDP) |
| Gestor imprime direto na física | Gestor ainda aponta para impressora errada |
| RedMon não executa receiver | Caminho do Node ou script incorreto na porta |
| PDF ilegível | Destino não contém "PDF" e modo ESC/POS foi usado |
| `targetPrinterName` vazio | Editar `config.json` |

## Captura de pedidos

A impressora virtual **só enriquece** — ainda precisa do cache de pedidos:

- **CDP** (dev): `enable-gestor-debug.ps1` + porta 9222
- **Produção futura**: electron-store watcher, ou CDP sem expor debug ao usuário

No totem final, CDP + serviço Windows como serviço é aceitável se o atalho do Gestor for provisionado pelo instalador.

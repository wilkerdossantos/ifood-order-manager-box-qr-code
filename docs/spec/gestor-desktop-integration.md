# Gestor Desktop Integration

## Prerequisites

- Windows with Gestor de Pedidos installed (`C:\Program Files (x86)\Gestor de Pedidos\`)
- Node.js for `npm run dev`
- Printer configured (Microsoft Print to PDF for testing, or a physical thermal printer)

## One-time setup

```powershell
cd C:\Users\wilke\ifood-order-manager-box-qr-code
npm install
npm run build

# 1. Cria atalho do Gestor com porta CDP 9222
.\scripts\enable-gestor-debug.ps1

# 2. Instala a impressora virtual (Generic/Text Only + porta FILE:)
.\scripts\install-virtual-printer.ps1

# 3. Configura o bridge (destino da comanda)
.\scripts\configure-bridge.ps1 -TargetPrinter "Microsoft Print to PDF"   # teste
# ou .\scripts\configure-bridge.ps1 -TargetPrinter "EPSON TM-T20"       # produção
```

## Daily workflow

```powershell
# 1. Feche o Gestor e abra pelo atalho Gestor de Pedidos.ifood-qr.lnk

# 2. Rode o serviço (PowerShell Admin)
npm run dev

# 3. No Gestor, imprima na impressora "iFood QR Bridge"
```

**Important:** Always launch Gestor via the `.ifood-qr.lnk` shortcut so the CDP
port (9222) is enabled. The default shortcut does not enable the debug port.

## Verification checklist

| Step | Expected |
|------|----------|
| `http://127.0.0.1:7420/health` | `{ "ok": true }` |
| `http://127.0.0.1:7420/diagnostics` | `cdpConnected: true` after Gestor opens |
| Receive order in Gestor | `[CDP] Pedido capturado` in npm terminal |
| Print on "iFood QR Bridge" | `[FILE] Arquivo de impressao detectado` |
| | `[IMPRESSÃO] QR adicionado à comanda` |
| | `[PRINT] Comanda encaminhada` |

## Troubleshooting

### CDP not connected

- Gestor not started with `--remote-debugging-port=9222`
- Restart Gestor via `Gestor de Pedidos.ifood-qr.lnk`

### Pedido capturado but no QR on print

- Check the virtual printer is installed: `Get-Printer -Name "iFood QR Bridge"`
  should show `Generic / Text Only` driver and a `.prn` port.
- Check `%ProgramData%\iFoodQrService\spool\output.prn` grows after printing.
- Order display ID not found in the raw text — check `spool\debug\*-readable.txt`.

### Virtual printer in Error state

- Restart the spooler: `Restart-Service Spooler -Force`
- Clear stuck jobs and re-run `.\scripts\install-virtual-printer.ps1`.

### Do NOT use

- Impressora GP iFood widget — browser only ([ADR-004](../adr/004-deprecated-approaches.md))
- Windows system proxy for Gestor Desktop

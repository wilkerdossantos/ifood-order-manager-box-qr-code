# Gestor Desktop Integration

## Prerequisites

- Windows with Gestor de Pedidos installed (`C:\Program Files (x86)\Gestor de Pedidos\`)
- Node.js for `npm run dev`
- Printer configured in Gestor (Microsoft Print to PDF works for testing)

## One-time setup

```powershell
cd C:\Users\wilke\ifood-order-manager-box-qr-code
npm install
.\scripts\enable-gestor-debug.ps1
```

This will:

1. Extract/patch Gestor into `%ProgramData%\iFoodQrService\gestor-unpacked`
2. Inject `enrichPrintInvoice` into `ipcHandler.js`
3. Copy hook scripts to `%ProgramData%\iFoodQrService\scripts`
4. Create shortcut `Gestor de Pedidos.ifood-qr.lnk` with:
   - `--remote-debugging-port=9222`
   - `--app-path=C:\ProgramData\iFoodQrService\gestor-unpacked`
5. Set `cdpPrintHookEnabled: false` in config

## Daily workflow

```powershell
# Terminal 1
npm run dev

# Terminal 2 (or after closing Gestor)
.\scripts\start-gestor-debug.ps1
```

**Important:** Always launch Gestor via the `.ifood-qr.lnk` shortcut (or `start-gestor-debug.ps1`). Starting Gestor from the default shortcut uses stock `app.asar` **without** the print hook.

## Verification checklist

| Step | Expected |
|------|----------|
| `http://127.0.0.1:7420/health` | `{ "ok": true }` |
| `http://127.0.0.1:7420/diagnostics` | `cdpConnected: true` after Gestor opens |
| Receive order in Gestor | `[PEDIDO CAPTURADO]` in npm terminal |
| Print comanda | `[IMPRESSÃO] QR adicionado` in npm terminal |
| Gestor main log | `[iFood QR] Impressao interceptada` |
| PDF test print | Text block `QR: LOJA:...|NP:...` at bottom |

## Troubleshooting

### CDP not connected

- Gestor not started with `--remote-debugging-port=9222`
- Restart Gestor via `.ifood-qr.lnk`

### Pedido capturado but no QR on print

- Order display ID not found in invoice text — check `%ProgramData%\iFoodQrService\print-preview\`
- Gestor log: `[iFood QR] Pedido nao encontrado no cache` → capture or ID extraction issue
- Re-run `.\scripts\setup-gestor-patch.ps1` after Gestor updates

### Hook not loaded

Verify patched ipcHandler:

```powershell
Select-String -Path "$env:ProgramData\iFoodQrService\gestor-unpacked\src\ipcHandler.js" -Pattern "enrichPrintInvoice"
```

### Do NOT use

- Impressora GP iFood widget — browser only ([ADR-004](../adr/004-deprecated-approaches.md))
- Windows system proxy for Gestor Desktop

## Re-patch after Gestor update

```powershell
Remove-Item "$env:ProgramData\iFoodQrService\gestor-unpacked" -Recurse -Force
.\scripts\enable-gestor-debug.ps1
```

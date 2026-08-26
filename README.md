# iFood QR Service — QR Code na Comanda

Serviço Windows que captura dados de pedidos do **Gestor de Pedidos Desktop** (Electron) e enriquece comandas térmicas com QR code — sem extensão Chrome e sem modificar o app iFood.

## O que faz

1. **Captura pedidos** via proxy HTTPS local e leitura do cache Electron (electron-store / IndexedDB)
2. **Mantém cache** com os campos necessários para o QR: `merchantId`, `displayId`, `pickupCode`, `orderType`, `orderId`
3. **Enriquece comandas** com QR ESC/POS via Print Bridge (named pipe) ou API HTTP local
4. **Roda como serviço Windows** com auto-start

### Payload do QR

```
LOJA:{merchantId}|NP:{displayId}|CR:{pickupCode}|TIPO:{orderType}|ID:{orderId}
```

## Arquitetura

```
Gestor Desktop (Electron)
    │
    ├── HTTPS APIs ──► Proxy :8888 ──► Order Cache
    ├── electron-store / IndexedDB ──► File Watcher ──► Order Cache
    └── IPC printOrder ──► Impressora ──► Print Bridge (pipe) ──► + QR ESC/POS
```

## Requisitos

- Windows 10/11
- Node.js 18+ (para instalação/build)
- Gestor de Pedidos Desktop instalado
- Impressora térmica ESC/POS

## Instalação

```powershell
# 1. Clone e instale
git clone <repo-url>
cd ifood-order-manager-box-qr-code

# 2. Instale o serviço (requer Admin)
.\scripts\install-service.ps1

# 3. Instale certificado raiz do proxy (requer Admin)
.\scripts\install-ca-cert.ps1

# 4. Configure proxy do Windows
# Configurações → Rede → Proxy → 127.0.0.1:8888
```

## Configuração

Arquivo: `%ProgramData%\iFoodQrService\config.json`

| Campo | Default | Descrição |
|-------|---------|-----------|
| `enabled` | `true` | Liga/desliga o serviço |
| `pdfMode` | `false` | Modo texto (sem ESC/POS binário) |
| `proxyPort` | `8888` | Porta do proxy HTTPS |
| `healthPort` | `7420` | Porta da API local |
| `targetPrinterName` | `""` | Impressora física de destino (print bridge) |
| `pipeName` | `ifood-qr-service` | Named pipe do print bridge |

## API local

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Status do serviço |
| `/cache/stats` | GET | Estatísticas do cache |
| `/orders` | GET | Lista pedidos em cache |
| `/orders/:displayId` | GET | Busca pedido por número |
| `/ingest` | POST | Ingere JSON manualmente (debug) |
| `/print/enrich` | POST | Enriquece invoice `{ "invoice": "..." }` |
| `/print` | POST | Enriquece body JSON de print (compatível extensão) |
| `/config/ca-cert` | GET | Download certificado CA |

## Print Bridge

Integração com driver/impressora virtual via named pipe:

```
\\.\pipe\ifood-qr-service
```

Protocolo (JSON + newline):

```json
{"action":"enrich","invoice":"PEDIDO: #6798\n..."}
```

Resposta:

```json
{"ok":true,"invoice":"...com QR ESC/POS...","payload":"LOJA:...|NP:6798|..."}
```

CLI de teste:

```bash
node scripts/print-bridge-client.js --file docs/fixtures/invoice-sample.txt
```

## Desenvolvimento

```bash
npm install
npm run dev      # inicia em foreground (logs no terminal)
npm run test:service   # testa health + ingest + enrich (com serviço rodando)
npm test         # testes unitários
npm run build    # compila TypeScript
```

### Logs

Com `npm run dev`, o terminal mostra:

| Tag | Significado |
|-----|-------------|
| `[STATUS]` | Resumo a cada 30s (pedidos no cache, hits do proxy) |
| `[PROXY]` | Requisição HTTPS interceptada |
| `[PEDIDO CAPTURADO]` | Pedido salvo no cache |
| `[IMPRESSÃO]` | QR adicionado a uma comanda |
| `[PRINT BRIDGE]` | Requisição via named pipe |

Arquivos de log (Windows):

```
C:\ProgramData\iFoodQrService\logs\service.log    # log completo JSON
C:\ProgramData\iFoodQrService\logs\activity.log   # só eventos importantes
```

### Verificar rapidamente

```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run test:service
curl http://127.0.0.1:7420/cache/stats
```

## Rotas interceptadas

Regex (mesma da extensão Chrome):

```
/orders?(?:\/|\?|$)|events:polling|expedition|merchant|store|totem
```

Consulte [docs/PHASE0-TRAFFIC-CAPTURE.md](docs/PHASE0-TRAFFIC-CAPTURE.md) para validação no ambiente do parceiro.

## Desinstalação

```powershell
.\scripts\uninstall-service.ps1
```

## Referências

- Lógica portada de [extensao-bruna/page-bridge.js](../extensao-bruna/page-bridge.js)
- Gestor Desktop: [order-manager-legacy-desktop](../iFood/order-manager-legacy-desktop) (shell Electron, print via IPC)

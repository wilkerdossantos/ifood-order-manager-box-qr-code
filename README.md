# iFood QR Service — QR Code na Comanda

Serviço Windows que captura dados de pedidos do **Gestor de Pedidos Desktop** (Electron) e enriquece comandas térmicas com QR code — sem extensão Chrome e sem modificar o app iFood.

## O que faz

1. **Captura pedidos** via CDP multi-target na porta debug do Gestor (9222)
2. **Mantém cache** JSON com dedup e TTL (`cache.json`) — campos do QR: `merchantId`, `displayId`, `pickupCode`, `orderType`, `orderId`
3. **Enriquece comandas** via hook IPC no Gestor (`print-main-hook.cjs`) — sem RedMon, sem impressora virtual
4. **Roda como serviço Windows** com auto-start

### Payload do QR

```
LOJA:{merchantId}|NP:{displayId}|CR:{pickupCode}|TIPO:{orderType}|ID:{orderId}
```

## Duas soluções

Este repositório implementa **duas soluções distintas** que se encontram no fluxo de impressão:

1. **Order Tracker** — captura pedidos do Gestor via CDP (porta debug 9222), persiste em cache JSON (`cache.json`) e expõe os dados na API local (`GET /orders`, `GET /orders/:displayId`). Evita consultas repetidas e centraliza `merchantId`, `displayId`, `pickupCode`, `orderType` e `orderId`.

2. **Print Bridge** — intercepta `printOrder` no processo principal do Electron (`print-main-hook.cjs`), consulta cache/API local, injeta QR e imprime na impressora **direta** (física ou Print to PDF).

Hoje ambas rodam no **mesmo processo** (`QrService`). **Não use impressora virtual** `iFood QR Bridge` — o hook injeta QR antes da impressora escolhida no Gestor.

Documentação completa: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — diagramas, contratos de API, matriz de deployment e limitações.

## Arquitetura

```
Gestor Desktop (Electron) — porta debug 9222
    │
    ├── CDP Network + fetch/XHR hooks ──► Order Cache  (principal)
    ├── electron-store / IndexedDB ──► File Watcher ──► Order Cache  (secundário)
    └── IPC printOrder ──► Print Bridge ──► + QR ESC/POS ──► Impressora
```

## Requisitos

- Windows 10/11
- Node.js 18+ (para instalação/build)
- Gestor de Pedidos Desktop instalado
- Impressora térmica ESC/POS

## Instalação (Gestor Desktop — recomendado)

```powershell
# 1. Clone e instale
git clone <repo-url>
cd ifood-order-manager-box-qr-code
npm install
npm run build

# 2. Habilitar CDP + hook de impressão no Gestor
.\scripts\enable-gestor-debug.ps1
# Feche o Gestor e abra pelo atalho *.ifood-qr.lnk

# 3. Rode o serviço
npm run dev

# 4. No Gestor: selecione impressora FÍSICA ou Microsoft Print to PDF (NÃO "iFood QR Bridge")
# 5. Receba um pedido — [CDP] Pedido capturado
# 6. Imprima — [iFood QR] QR adicionado (console do Gestor)
```

**Por que CDP?** O Gestor Desktop guarda pedidos no IndexedDB (formato binário V8). Ler arquivos não captura pedidos novos. A porta debug permite interceptar as APIs em tempo real — igual à extensão Chrome.

**Importante:** Não configure proxy manual no Windows para o Gestor Desktop. O proxy quebra a conexão HTTPS do Electron.

Se você já configurou o proxy e o Gestor mostra "Buscando conexão com a internet":

```powershell
.\scripts\disable-proxy.ps1
```

Depois reinicie o Gestor de Pedidos.

## Instalação como serviço Windows

```powershell
.\scripts\install-service.ps1
```

## Proxy HTTPS (opcional — só Gestor Web)

Para o Gestor **Web** no navegador (não Desktop), edite `%ProgramData%\iFoodQrService\config.json`:

```json
{
  "proxyEnabled": true,
  "mitmEnabled": true
}
```

Então instale o certificado CA e configure proxy `127.0.0.1:8888`.

## Configuração

Arquivo: `%ProgramData%\iFoodQrService\config.json`

| Campo | Default | Descrição |
|-------|---------|-----------|
| `enabled` | `true` | Liga/desliga o serviço |
| `pdfMode` | `false` | Modo texto (sem ESC/POS binário) |
| `healthPort` | `7420` | Porta da API local |
| `printCacheWaitMs` | `2000` | Espera pelo pedido no cache antes de imprimir sem QR |
| `cacheMaxAgeHours` | `24` | TTL de pedidos no cache (0 = sem expiração) |
| `printQueueWatchEnabled` | `false` | Fila Windows — **experimental**, requer Admin |
| `cdpPrintHookEnabled` | `false` | Hook CDP renderer (fallback; use print-main-hook) |
| `electronStoreWatchEnabled` | `false` | Scan electron-store (backup não confiável) |
| `targetPrinterName` | `""` | Destino ao reencaminhar jobs da fila (modo experimental) |
| `pipeName` | `ifood-qr-service` | Named pipe para integrações externas |

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

## Impressora virtual (experimental — fallback)

**Recomendado:** use `print-main-hook.cjs` + impressora direta (sem virtual).

A impressora virtual `iFood QR Bridge` (PORTPROMPT + fila Windows) é **experimental** no Windows 11 — requer Admin, parse de SPL frágil, e conflita com o hook IPC. Só use se o hook não funcionar.

```powershell
npm run configure:portprompt   # habilita printQueueWatchEnabled
npm run dev                    # Admin obrigatório
```

Log esperado com hook (caminho recomendado):

```
[iFood QR] print-main-hook.cjs carregado
[iFood QR] Impressão interceptada → EPSON TM-T20
[iFood QR] QR adicionado — LOJA:...|NP:6798|...
```

## Print Bridge (named pipe)

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
| `[CDP]` | Pedido capturado ou impressão interceptada |
| `[IMPRESSÃO]` | QR adicionado a uma comanda |
| `[PRINT]` | Preview da comanda salvo em disco |
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
curl http://127.0.0.1:7420/diagnostics
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

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura Order Tracker + Print Bridge
- Lógica portada de [extensao-bruna/page-bridge.js](../extensao-bruna/page-bridge.js)
- Gestor Desktop: [order-manager-legacy-desktop](../iFood/order-manager-legacy-desktop) (shell Electron, print via IPC)

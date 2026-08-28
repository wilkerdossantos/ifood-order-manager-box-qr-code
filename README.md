# iFood QR Service — QR Code na Comanda

Serviço Windows que captura dados de pedidos do **Gestor de Pedidos Desktop** (Electron) e enriquece comandas térmicas com QR code — sem extensão Chrome e sem modificar o app iFood.

## O que faz

1. **Captura pedidos** via CDP multi-target na porta debug do Gestor (9222)
2. **Mantém cache** JSON com dedup e TTL (`cache.json`) — campos do QR: `merchantId`, `displayId`, `pickupCode`, `orderType`, `orderId`
3. **Enriquece comandas** via hook no `thermal-printer.print` do Gestor (main process) — sem RedMon, sem impressora virtual
4. **Roda como serviço Windows** com auto-start

### Payload do QR

```
LOJA:{merchantId}|NP:{displayId}|CR:{pickupCode}|TIPO:{orderType}|ID:{orderId}
```

## Arquitetura

```
Gestor Desktop (Electron) — porta debug 9222
    │
    ├── CDP Network + fetch/XHR hooks ──► Order Cache
    └── ipcHandler.js ──► thermal-printer.print (patch) ──► + QR ──► Impressora
```

Dois componentes distintos que se encontram no fluxo de impressão:

1. **Order Tracker** — captura pedidos do Gestor via CDP (porta 9222), persiste em cache JSON e expõe os dados na API local (`GET /orders`, `GET /orders/:displayId`).

2. **Print Hook** — intercepta `thermal-printer.print` no processo principal do Electron (`gestor-ipc-print-hook.mjs`), consulta a API local, injeta QR e imprime na impressora **direta** (física ou Print to PDF).

Documentação completa: **[docs/](docs/README.md)** — ADRs e especificações (ver `docs/spec/gestor-desktop-integration.md`).

## Requisitos

- Windows 10/11
- Node.js 18+ (para instalação/build)
- Gestor de Pedidos Desktop instalado
- Impressora térmica ESC/POS (ou Microsoft Print to PDF para teste)

## Instalação (Gestor Desktop)

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

# 4. No Gestor: selecione impressora FÍSICA ou Microsoft Print to PDF
# 5. Receba um pedido — [CDP] Pedido capturado
# 6. Imprima — [IMPRESSÃO] QR adicionado (npm run dev)
```

**Por que CDP?** O Gestor Desktop guarda pedidos no IndexedDB (formato binário V8). Ler arquivos não captura pedidos novos. A porta debug permite interceptar as APIs em tempo real — igual à extensão Chrome.

## Instalação como serviço Windows

```powershell
.\scripts\install-service.ps1
```

## Configuração

Arquivo: `%ProgramData%\iFoodQrService\config.json`

| Campo | Default | Descrição |
|-------|---------|-----------|
| `enabled` | `true` | Liga/desliga o serviço |
| `pdfMode` | `false` | Modo texto (sem ESC/POS binário) |
| `healthPort` | `7420` | Porta da API local |
| `cdpEnabled` | `true` | Captura via CDP (porta debug do Electron) |
| `cdpPort` | `9222` | Porta de debug do Gestor |
| `printCacheWaitMs` | `2000` | Espera pelo pedido no cache antes de imprimir sem QR |
| `cacheMaxAgeHours` | `24` | TTL de pedidos no cache (0 = sem expiração) |
| `printPreviewEnabled` | `true` | Salva cópia legível de cada comanda enriquecida |

## API local

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Status do serviço |
| `/cache/stats` | GET | Estatísticas do cache |
| `/orders` | GET | Lista pedidos em cache |
| `/orders/:displayId` | GET | Busca pedido por número |
| `/ingest` | POST | Ingere JSON manualmente (debug) |
| `/print/enrich` | POST | Enriquece invoice `{ "invoice": "..." }` |
| `/print` | POST | Enriquece body JSON de print |
| `/diagnostics` | GET | Estado CDP + cache |

## Desenvolvimento

```bash
npm install
npm run dev            # inicia em foreground (logs no terminal)
npm run test:service   # testa health + ingest + enrich (com serviço rodando)
npm test               # testes unitários
npm run build          # compila TypeScript
```

### Logs

Com `npm run dev`, o terminal mostra:

| Tag | Significado |
|-----|-------------|
| `[STATUS]` | Resumo a cada 30s (pedidos no cache) |
| `[PEDIDO CAPTURADO]` | Pedido salvo no cache |
| `[CDP]` | Pedido capturado via CDP |
| `[IMPRESSÃO]` | QR adicionado a uma comanda |
| `[PRINT]` | Preview da comanda salvo em disco |

Arquivos de log (Windows):

```
C:\ProgramData\iFoodQrService\logs\service.log     # log completo JSON
C:\ProgramData\iFoodQrService\logs\activity.log    # só eventos importantes
C:\ProgramData\iFoodQrService\logs\print-hook.log  # hook de impressão (main process)
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

- [docs/spec/gestor-desktop-integration.md](docs/spec/gestor-desktop-integration.md) — integração com o Gestor Desktop
- [docs/spec/print-pipeline.md](docs/spec/print-pipeline.md) — fluxo de impressão e injeção do QR
- [docs/adr/](docs/adr/) — registros de decisão de arquitetura

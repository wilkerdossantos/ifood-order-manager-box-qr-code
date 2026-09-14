# iFood QR Service — QR Code na Comanda

Serviço Windows que captura dados de pedidos do **Gestor de Pedidos Desktop** (Electron) e enriquece comandas térmicas com QR code — sem extensão Chrome e sem modificar o app iFood.

## O que faz

1. **Captura pedidos** via CDP multi-target na porta debug do Gestor (9222)
2. **Mantém cache** JSON com dedup e TTL (`cache.json`) — campos do QR: `merchantId`, `displayId`, `pickupCode`, `orderType`, `orderId`
3. **Enriquece comandas** interceptando o spool da impressora virtual — injeta o QR no stream raw ESC/POS
4. **Reencaminha** para a impressora térmica física (ou PDF no teste)

### Payload do QR

```
LOJA:{merchantId}|NP:{displayId}|CR:{pickupCode}|TIPO:{orderType}|ID:{orderId}
```

## Arquitetura

```
Gestor Desktop (Electron) — porta debug 9222
    │
    ├── CDP Network + fetch/XHR hooks ──► Order Cache
    │
    └── imprime em "iFood QR Bridge" (impressora virtual)
              │
              ▼
        porta FILE: → spool/output.prn (stream ESC/POS raw)
              │
              ▼
        file-watcher detecta o arquivo
              │
              ├── extrai displayId do texto ("PEDIDO: #0011")
              ├── consulta o cache (CDP) → gera o payload do QR
              ├── injeta o QR ESC/POS no stream
              └── reencaminha p/ impressora física (raw) ou PDF (texto)
```

## Requisitos

- Windows 10/11
- Node.js 18+
- Gestor de Pedidos Desktop instalado
- Impressora térmica ESC/POS (EPSON/Elgin/Daruma) — ou Microsoft Print to PDF para teste

## Instalação

```powershell
# 1. Clone e instale
git clone <repo-url>
cd ifood-order-manager-box-qr-code
npm install
npm run build

# 2. Habilitar o CDP (atalho do Gestor com porta debug)
.\scripts\enable-gestor-debug.ps1

# 3. Instalar a impressora virtual (driver Generic/Text Only + porta FILE:)
.\scripts\install-virtual-printer.ps1

# 4. Configurar o bridge (destino da comanda)
.\scripts\configure-bridge.ps1 -TargetPrinter "Microsoft Print to PDF"   # teste
# ou, com térmica física instalada:
.\scripts\configure-bridge.ps1 -TargetPrinter "EPSON TM-T20"

# 5. Rodar o serviço (PowerShell Admin, para ler o spool)
npm run dev
```

**Fluxo de uso:**

1. Feche o Gestor e abra pelo atalho `Gestor de Pedidos.ifood-qr.lnk` (porta CDP 9222)
2. `npm run dev`
3. Receba um pedido — `[CDP] Pedido capturado`
4. No Gestor, imprima na impressora **"iFood QR Bridge"**
5. O serviço captura o `output.prn`, injeta o QR e reencaminha para a impressora destino

## Configuração

Arquivo: `%ProgramData%\iFoodQrService\config.json`

| Campo | Default | Descrição |
|-------|---------|-----------|
| `enabled` | `true` | Liga/desliga o serviço |
| `pdfMode` | `false` | Modo texto (sem ESC/POS binário) |
| `healthPort` | `7420` | Porta da API local |
| `cdpEnabled` | `true` | Captura via CDP (porta debug do Electron) |
| `cdpPort` | `9222` | Porta de debug do Gestor |
| `printerName` | `iFood QR Bridge` | Impressora virtual de captura |
| `targetPrinterName` | `""` | Impressora de destino (térmica física) |
| `printFileWatchEnabled` | `false` | Monitora `output.prn` (ligado pelo configure-bridge) |
| `printCacheWaitMs` | `2000` | Espera pelo pedido no cache antes de imprimir sem QR |
| `cacheMaxAgeHours` | `24` | TTL de pedidos no cache (0 = sem expiração) |
| `printPreviewEnabled` | `true` | Salva cópia legível de cada comanda enriquecida |
| `mockMode` | `false` | Apresentação: fixa `merchantId`/`orderType`/`orderId` em `mock` e gera `displayId`/`pickupCode` aleatórios a cada impressão |

## API local

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Status do serviço |
| `/cache/stats` | GET | Estatísticas do cache |
| `/orders` | GET | Lista pedidos em cache |
| `/orders/:displayId` | GET | Busca pedido por número |
| `/ingest` | POST | Ingere JSON manualmente (debug) |
| `/print/enrich` | POST | Enriquece invoice `{ "invoice": "..." }` |
| `/diagnostics` | GET | Estado CDP + file-watcher + cache |

## Desenvolvimento

```bash
npm install
npm run dev            # inicia em foreground (logs no terminal)
npm run test:service   # testa health + ingest + enrich (com serviço rodando)
npm test               # testes unitários
npm run build          # compila TypeScript
```

## Build & release

Para gerar o executável (`.exe`) e empacotar uma versão, veja [BUILD.md](BUILD.md):

- `npm version patch|minor|major` — sobe a versão e cria a git tag
- `npm run build:exe` — gera `dist-bundle/ifood-qr-service.exe` (Node SEA, rodar no Windows)
- `npm run package` — monta o zip distribuível `ifood-qr-service-v{versão}.zip`

### Logs

Com `npm run dev`, o terminal mostra:

| Tag | Significado |
|-----|-------------|
| `[STATUS]` | Resumo a cada 30s (pedidos no cache) |
| `[PEDIDO CAPTURADO]` | Pedido salvo no cache |
| `[CDP]` | Pedido capturado via CDP |
| `[FILE]` | Arquivo `output.prn` detectado/processado |
| `[QUEUE]` | Job de impressão processado (extração + enriquecimento) |
| `[IMPRESSÃO]` | QR adicionado a uma comanda |
| `[PRINT]` | Preview salvo / comanda reencaminhada |

Arquivos de log (Windows):

```
C:\ProgramData\iFoodQrService\logs\service.log     # log completo JSON
C:\ProgramData\iFoodQrService\logs\activity.log    # só eventos importantes
C:\ProgramData\iFoodQrService\spool\output.prn     # stream raw capturado
C:\ProgramData\iFoodQrService\spool\debug\         # dumps (*-readable.txt, *-enriched.txt)
```

## Desinstalação

```powershell
.\scripts\uninstall-service.ps1
```

## Referências

- [docs/adr/](docs/adr/) — registros de decisão de arquitetura
- [docs/spec/](docs/spec/) — especificações de integração

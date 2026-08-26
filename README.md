# iFood QR Service — QR Code na Comanda

Serviço Windows que captura dados de pedidos do **Gestor de Pedidos Desktop** (Electron) e enriquece comandas térmicas com QR code — sem extensão Chrome e sem modificar o app iFood.

## O que faz

1. **Captura pedidos** via CDP (Chrome DevTools Protocol) na porta debug do Gestor + scan do cache Electron
2. **Mantém cache** com os campos necessários para o QR: `merchantId`, `displayId`, `pickupCode`, `orderType`, `orderId`
3. **Enriquece comandas** com QR ESC/POS via Print Bridge (named pipe) ou API HTTP local
4. **Roda como serviço Windows** com auto-start

### Payload do QR

```
LOJA:{merchantId}|NP:{displayId}|CR:{pickupCode}|TIPO:{orderType}|ID:{orderId}
```

## Arquitetura

```
Gestor Desktop (Electron) — porta debug 9222
    │
    ├── CDP Network + fetch/XHR hooks ──► Order Cache  (principal)
    ├── electron-store / IndexedDB ──► File Watcher ──► Order Cache  (secundário)
    └── IPC printOrder ──► Impressora ──► Print Bridge (pipe) ──► + QR ESC/POS
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

# 2. Habilitar debug no Gestor (OBRIGATÓRIO para capturar pedidos)
.\scripts\enable-gestor-debug.ps1
# Feche o Gestor e abra pelo atalho *debug* criado

# 3. Rode o serviço (NÃO configure proxy do Windows)
npm run dev

# 4. Receba um pedido no Gestor — deve aparecer [CDP] Pedido capturado
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

## Impressora virtual (Windows 11, sem RedMon)

Dois modos de interceptacao:

| Modo | Porta / Driver | Como intercepta |
|------|----------------|-----------------|
| **Arquivo** (ideal) | Local `output.prn` + Generic/Text | SpoolWatcher monitora arquivo |
| **PORTPROMPT + PDF** (Windows 11) | PORTPROMPT + Microsoft Print to PDF | **QueueWatcher** monitora fila Windows |

```
Gestor -> "iFood QR Bridge" -> [QUEUE] captura SPL -> enriquece -> impressora destino
```

```powershell
# PowerShell Admin (obrigatorio para ler spool do Windows)
npm run install:virtual-printer -- -TargetPrinter "Microsoft Print to PDF" -UsePortPrompt
npm run dev

# Gestor -> Impressora -> "iFood QR Bridge"
```

Se voce ja criou a impressora manualmente (PORTPROMPT + PDF), basta garantir no config:

```json
{
  "printQueueWatchEnabled": true,
  "targetPrinterName": "Microsoft Print to PDF"
}
```

Log ao imprimir:

```
[QUEUE] Job de impressao detectado
[PRINT DEBUG] Dump salvo
[PRINT] Comanda encaminhada (TEXT)
```

**Importante:** com destino PDF, o QR vai como **texto legivel** (nao ESC/POS binario) — PDF abre normalmente.

**Modo debug** — arquivos em `C:\ProgramData\iFoodQrService\spool\debug\`:

| Arquivo | Conteudo |
|---------|----------|
| `*-readable.txt` | Texto legivel da comanda (strip ESC/POS) |
| `*-enriched.txt` | O que vai para a impressora (+ QR se injetado) |
| `*-raw.bin` | Bytes brutos |
| `*-meta.json` | Pedido no cache, payload, modified |

```powershell
curl http://127.0.0.1:7420/print/debug
curl http://127.0.0.1:7420/diagnostics
```

Detalhes: [docs/PRINT-BRIDGE-DRIVER.md](docs/PRINT-BRIDGE-DRIVER.md)

---

## Alternativa: hook no Gestor (sem impressora virtual)

```powershell
npm run dev
npm run enable:gestor
# Abrir Gestor pelo atalho *.ifood-qr.lnk
```

---

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

- Lógica portada de [extensao-bruna/page-bridge.js](../extensao-bruna/page-bridge.js)
- Gestor Desktop: [order-manager-legacy-desktop](../iFood/order-manager-legacy-desktop) (shell Electron, print via IPC)

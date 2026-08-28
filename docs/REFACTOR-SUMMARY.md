# Refactor Summary — 2026-08-28

Registro completo do trabalho de refatoração do iFood QR Service, do problema
original até a solução validada.

## Problema original

> "Consigo capturar os pedidos, mas não consigo interceptar a impressão para
> inserir o QR code."

A captura de pedidos via CDP já funcionava. A injeção do QR na comanda impressa
não funcionava de forma confiável.

## Diagnóstico e pivôs de arquitetura

Foram tentadas três abordagens de interceptação de impressão. Duas falharam e
foram descartadas; a terceira funcionou.

### 1. Hook no processo principal do Electron (❌ rejeitada)

**Ideia:** patchear `main.mjs` / `ipcHandler.js` do `app.asar` extraído para
envolver `@ifood/thermal-printer.print` e enriquecer o invoice antes de imprimir.

**Resultado:** o `main.mjs` patcheado **nunca foi carregado** pelo Electron.
Mesmo com `--app-path` apontando para o diretório unpacked, deploy correto e
reinício do processo, o módulo injetado não executou (nenhuma linha de log,
nenhum efeito colateral). Patchear internals do Electron provou-se frágil demais.

**Evidência:** `print-hook.log` não recebeu nenhuma linha nova (nem o log
top-level de import do módulo), mesmo com o processo reiniciado.

### 2. PORTPROMPT + fila Windows (❌ rejeitada)

**Ideia:** impressora virtual com driver "Generic / Text Only" + porta PORTPROMPT,
que "segura" o job na fila para o queue-watcher capturar o SPL.

**Resultado:** o PORTPROMPT é uma porta de **prompt interativo** — ao imprimir,
o Windows pergunta "para qual arquivo?" e, sem resposta, deixa o SPL **vazio**
(0 bytes). O arquivo `FP00011.SPL` (`FP` = File Prompt) ficou preso com erro.

### 3. Porta FILE: + file-watcher (✅ adotada)

**Ideia:** impressora virtual com driver "Generic / Text Only" + porta **FILE:**
fixa apontando para `spool/output.prn`. O spooler grava o stream raw ESC/POS
diretamente no arquivo — sem job na fila e sem prompt interativo.

**Resultado:** funcionou. O serviço monitora o arquivo (polling de size/mtime),
lê o raw, extrai o displayId, consulta o cache (CDP), injeta o QR e reencaminha
para a impressora de destino.

## Arquitetura final

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

### Payload do QR

```
LOJA:{merchantId}|NP:{displayId}|CR:{pickupCode}|TIPO:{orderType}|ID:{orderId}
```

## Bugs encontrados e corrigidos

| Bug | Causa | Correção |
|-----|-------|----------|
| `config.json` ignorado pelo serviço | BOM (U+FEFF) adicionado pelo PowerShell 5.1 (`Set-Content -Encoding UTF8`) quebra o `JSON.parse` | Strip do BOM antes do parse em `loadConfig` |
| `cdpPrintHookEnabled` inconsistente | Código dizia `true`, ADR-003 e spec diziam `false` | Alinhado para `false` (hook CDP é deprecated) |
| `.SHD`/`.SPL` não encontrado | O nome da impressora não está nos bytes do `.SHD` (PORTPROMPT) | Fallback para o SPL mais recente + troca para porta FILE: |

## Limpeza de código legado

Removidos (conforme ADR-004 — abordagens deprecated):

**src/collector/**
- `proxy-interceptor.ts` (proxy HTTPS)
- `electron-store-watcher.ts` (+ teste)
- `storage-parser.ts`

**src/print/**
- `bridge-server.ts` (named pipe)
- `spool-watcher.ts`
- `queue-watcher.ts` (substituído por `file-watcher.ts`)
- `raw-forwarder.ts` (recriado — agora usado pelo file-watcher)
- `print-job-handler.ts` (recriado — agora usado pelo file-watcher)
- `print-debug-writer.ts` (recriado)

**scripts/**
- `setup-gestor-patch.ps1`, `start-gestor-debug.ps1` (hook Electron)
- `gestor-ipc-print-hook.mjs`, `gestor-preload-hook.mjs`
- `enrich-cli.cjs`, `enrich-client.cjs` (+ teste)
- `get-print-jobs.ps1`, `capture-print-job.ps1` (queue watch)
- `print-main-hook.cjs`, `printer-widget-print-hook.cjs`
- `install-virtual-printer.cmd`, `print-port-receiver.js`, `print-bridge-client.js`
- `configure-portprompt-mode.ps1` → renomeado para `configure-bridge.ps1`
- ~40 scripts de diagnóstico one-off (`diag-*.mjs`, `analyze-*.mjs`, `test-*.mjs`)

**Dependências removidas:** `chokidar`, `node-forge`, `@types/node-forge`

## Renomeação de config

| Antes | Depois | Motivo |
|-------|--------|--------|
| `printQueueWatchEnabled` | `printFileWatchEnabled` | Agora monitora arquivo (`output.prn`), não fila Windows |

## Estrutura final (src/)

```
src/
├── collector/
│   ├── cdp-collector.ts        # captura via CDP (porta 9222)
│   ├── ingest-deduper.ts       # dedup de pedidos
│   └── order-cache.ts          # cache JSON (dedup + TTL)
├── config/
│   ├── index.ts                # loadConfig (com strip de BOM)
│   └── types.ts                # ServiceConfig + DEFAULT_CONFIG
├── print/
│   ├── file-watcher.ts         # monitora output.prn (polling)
│   ├── print-job-handler.ts    # extrai displayId, injeta QR, reencaminha
│   ├── raw-forwarder.ts        # envia raw/text p/ impressora destino
│   ├── print-debug-writer.ts   # dumps de debug
│   └── preview-writer.ts       # preview legível da comanda
├── qr/
│   ├── escpos.ts               # geração de QR ESC/POS
│   ├── invoice-enricher.ts     # injeção do QR (string ou array)
│   └── payload.ts              # geração do payload do QR
├── service/
│   ├── main.ts                 # orquestração (QrService)
│   ├── http-api.ts             # API local (health, orders, enrich, diagnostics)
│   └── status-reporter.ts      # resumo periódico
└── utils/
    ├── activity-log.ts         # logs de eventos
    ├── logger.ts               # winston
    └── strings.ts              # extractDisplayIdFromInvoice + helpers
```

## Scripts finais (scripts/)

| Script | Papel |
|--------|-------|
| `enable-gestor-debug.ps1` | Cria atalho do Gestor com `--remote-debugging-port=9222` |
| `install-virtual-printer.ps1` | Instala "iFood QR Bridge" (Generic/Text Only + FILE:) |
| `configure-bridge.ps1` | Configura o bridge (destino da comanda) |
| `forward-raw-print.ps1` | Envia raw ESC/POS p/ impressora (via winspool.drv) |
| `forward-text-print.ps1` | Envia texto p/ impressora (modo PDF/teste) |
| `install-service.ps1` / `uninstall-service.ps1` | Serviço Windows (NSSM) |
| `stop-dev.ps1` | Para o serviço dev (porta 7420) |
| `test-service.js` | Testa health + ingest + enrich |

## Validação

- **TypeScript:** `tsc --noEmit` limpo (sem erros).
- **Testes unitários:** 23 passando (5 arquivos).
- **Teste end-to-end (Windows):** 2 pedidos reais (`0011` e `0055`) com QR
  injetado e comanda reencaminhada. Confirmado no log:

```
[FILE] Arquivo de impressao detectado (bytes=1641)
[QUEUE] Job de impressao detectado (displayId=0055)
[IMPRESSÃO] QR adicionado à comanda — NP:0055
[QUEUE] QR adicionado a comanda
[PRINT] Comanda encaminhada (Microsoft Print to PDF)
```

E o output enriquecido contém o QR no final:

```
────────────────────────────────
QR:
LOJA:cbe4ca5b-...|NP:0055|CR:N/A|TIPO:DINE_IN|ID:5fd6795b-...
```

## Pendências

1. **Teste com impressora térmica física** (EPSON/Elgin/Daruma). Hoje o teste
   usou "Microsoft Print to PDF". Com a térmica instalada:
   ```powershell
   .\scripts\configure-bridge.ps1 -TargetPrinter "EPSON TM-T20"
   ```
   O `forward-raw-print.ps1` já envia raw ESC/POS corretamente.

2. **Merge na main** — o trabalho está no branch `refactor/remove-legacy-and-fix-qr`.

## Histórico de commits (branch `refactor/remove-legacy-and-fix-qr`)

| Commit | Descrição |
|--------|-----------|
| `3b1a1ec` | Remove legacy print/proxy approaches and align config with ADR-004 |
| `e3c49b4` | Add raw invoice dump to print hook (diagnóstico) |
| `11344c3` | Harden installThermalPrinterHook (diagnóstico) |
| `1a8b7e7` | Add top-level module-import log (diagnóstico) |
| `2cf65d0` | Rewrite print bridge via PORTPROMPT + raw spool queue |
| `78b5655` | Fix config.json BOM breaking JSON.parse |
| `0ccb26e` | Harden spool capture (pause job, fallback) |
| `8291286` | Pivot print capture to FILE: port + file watcher |
| `acf693f` | Final cleanup: FILE: bridge naming, docs, remove hook legacy |

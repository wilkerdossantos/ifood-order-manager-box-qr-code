# Build & Release

Como gerar o executável único (`.exe`) do iFood QR Service e empacotar uma versão.

## Versão

A versão tem uma **única fonte da verdade**: o campo `version` do `package.json`.

Ela é:

- injetada no `.exe` no momento do build (esbuild `define` → `process.env.APP_VERSION`);
- exposta em `GET /health` (campo `version`) e no log de startup (`version` + `buildTime`);
- usada no nome do zip distribuível (`ifood-qr-service-v{versão}.zip`).

Para subir a versão (semver) e **criar a git tag** correspondente:

```bash
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.1 -> 1.1.0
npm version major   # 1.1.0 -> 2.0.0
```

> `npm version` faz commit do `package.json` e cria a tag `v{versão}` automaticamente.

## Build do .exe

```bash
npm install
npm run build:exe   # gera dist-bundle/ifood-qr-service.exe
```

O `build:exe` usa **Node SEA** (single executable application):

1. `esbuild` empacota `src/service/main.ts` (ESM → CJS) com as dependências embutidas;
2. `node --experimental-sea-config` gera o blob (`sea-prep.blob`);
3. copia o binário `node.exe` da máquina;
4. `postject` injeta o blob → `ifood-qr-service.exe`.

**Importante:** rode o `build:exe` **no Windows**. O executável copia o `node.exe`
da máquina de build, então o artefato herda arquitetura/SO do host (Windows x64).

## Empacotamento (zip)

```bash
npm run package   # gera ifood-qr-service-v{versão}.zip na raiz
```

O zip contém:

- `ifood-qr-service.exe`
- `install.ps1` (instalador one-click)
- `install-virtual-printer.ps1`, `configure-bridge.ps1`, `enable-gestor-debug.ps1`
- `forward-raw-print.ps1`, `forward-text-print.ps1`
- `README-instalacao.txt`

## Fluxo de release

```bash
# 1. Sobe a versão (cria git tag)
npm version patch

# 2. Build do executável (Windows)
npm run build:exe

# 3. Empacota o zip
npm run package

# 4. Confere
#    - zip: ifood-qr-service-v{versão}.zip
#    - GET /health -> { "version": "{versão}", ... }
```

## Verificação do artefato

Depois de instalar, confira a versão via health:

```powershell
Invoke-RestMethod http://127.0.0.1:7420/health
# { "ok": true, "enabled": true, "version": "1.0.1" }
```

O log de startup (`C:\ProgramData\iFoodQrService\logs\service.log`) também registra
`version` e `buildTime`.

## Notas

- Em `npm run dev` / `npm start` (sem o bundle SEA), `/health` reporta `version: "dev"`.
  Só o `.exe` (build de release) carrega a versão do `package.json`.
- `dist-bundle/` e `dist-package/` são diretórios de build — não versionar o `.exe`.

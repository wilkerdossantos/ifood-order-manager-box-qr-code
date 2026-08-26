# Fase 0 — Captura de tráfego do Gestor Desktop

Guia para validar URLs, payloads e paths de cache no ambiente Windows do parceiro **antes** de colocar o serviço em produção.

## Pré-requisitos

- Gestor de Pedidos Desktop instalado (`ifood.order.manager`)
- Acesso administrativo no totem Windows
- Ferramenta de captura: [Fiddler Classic](https://www.telerik.com/fiddler) ou [mitmproxy](https://mitmproxy.org/)

## 1. Captura HTTPS com mitmproxy

```powershell
# Instalar mitmproxy (via winget ou pip)
pip install mitmproxy

# Iniciar proxy na porta 8888
mitmproxy --listen-port 8888

# Em outro terminal: instalar certificado raiz no Windows
mitmproxy --set confdir=%USERPROFILE%\.mitmproxy
# Abrir %USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer e instalar em "Autoridades de Certificação Raiz Confiáveis"
```

Configure proxy do sistema Windows:

```
Configurações → Rede → Proxy → Manual → 127.0.0.1:8888
```

Abra o Gestor Desktop, faça login e receba/imprima um pedido de teste.

### URLs a registrar

Filtre no mitmproxy por:

| Padrão | Propósito |
|--------|-----------|
| `events:polling` | Polling de eventos (principal fonte de pedidos) |
| `/orders` | Listagem/detalhe de pedidos |
| `/order/` | Pedido individual |
| `expedition` | MFE expedição |
| `merchant` | Metadados da loja |
| `store` | Store ID |
| `totem` | Contexto salão/totem |

Salve exemplos de response JSON em `docs/fixtures/` para testes unitários.

## 2. Paths de cache local do Electron

Verifique estes diretórios no Windows:

```
%APPDATA%\Gestor de Pedidos\
%APPDATA%\ifood-order-manager\
%APPDATA%\ifood.order.manager\
```

Arquivos relevantes:

| Arquivo | Conteúdo |
|---------|----------|
| `local-storage.json` | electron-store migrado do localStorage |
| `config.json` | Configurações do electron-store |
| `IndexedDB/` | Cache do Order SDK (Chromium) |
| `Local Storage/leveldb/` | localStorage nativo do Chromium |

Comando para listar:

```powershell
Get-ChildItem -Recurse "$env:APPDATA\Gestor de Pedidos" | Select-Object FullName, Length, LastWriteTime
```

## 3. Formato do invoice na impressão

Imprima uma comanda de teste e capture:

1. **Spooler Windows**: `Get-PrintJob -PrinterName "NOME_DA_IMPRESSORA"`
2. Ou habilite log do serviço QR (`logLevel: debug`) e use endpoint `POST /print/enrich` com o texto da comanda

Campos esperados no invoice:

```
PEDIDO: #6798
CÓDIGO DE COLETA: XY12
RETIRADA / DELIVERY / SERVIR NA MESA
```

## 4. Checklist de validação

- [ ] URLs de `events:polling` documentadas com payload real
- [ ] Response de `/orders` contém `displayId`, `merchantId`, `pickupCode`
- [ ] Path do electron-store confirmado
- [ ] IndexedDB contém chaves do Order SDK
- [ ] Invoice térmico contém `PEDIDO: #NNNN`
- [ ] HTTPS pinning: Electron aceita certificado mitmproxy? (se não, usar apenas electron-store watcher)

## 5. Exportar fixtures para o repositório

Após captura, salve JSON anonimizado em:

```
docs/fixtures/polling-response.json
docs/fixtures/order-detail.json
docs/fixtures/invoice-sample.txt
```

Esses arquivos alimentam os testes em `src/collector/order-cache.test.ts`.

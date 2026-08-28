# ADR-002: Order Capture Strategy

## Status

Accepted (2026-08-28)

## Context

To enrich a comanda, the service must know `displayId`, `merchantId`, `pickupCode`, and `orderType` before print time. Gestor Desktop loads order data from remote APIs; local disk stores are incomplete and unreliable for real-time capture.

## Options considered

| Strategy | Pros | Cons |
|----------|------|------|
| **CDP (Chrome DevTools Protocol)** | Sees live network responses; no TLS MITM; works with Desktop | Requires `--remote-debugging-port` on Gestor |
| Windows HTTPS proxy | Full traffic | Breaks Desktop; user explicitly rejected |
| `electron-store` file watcher | Offline | Stale/partial data; misses polling payloads |
| Parse print body only | No setup | Often missing merchant/pickup fields |

## Decision

**Use CDP network interception as the primary order capture path.**

1. Gestor started with `--remote-debugging-port=9222` (via `enable-gestor-debug.ps1`).
2. Service connects to CDP and ingests responses matching `ingestUrlPattern` (orders, events:polling, merchant config, etc.).
3. Orders stored in `OrderCache` (`ProgramData/iFoodQrService/cache.json`).
4. Optional fallbacks (kept but not primary): `/ingest` HTTP API, electron-store watcher.

**Do not** rely on CDP renderer print hook (`cdpPrintHookEnabled`) for Desktop — prints are EscPos arrays handled in main process (ADR-003).

## Consequences

- User must launch Gestor via `.ifood-qr.lnk` shortcut (patched app path + CDP port).
- `/diagnostics` exposes `cdpConnected: true` when capture is healthy.
- `[PEDIDO CAPTURADO]` in `npm run dev` confirms capture before testing print.

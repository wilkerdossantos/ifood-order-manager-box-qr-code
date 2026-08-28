# iFood QR Service — Documentation

## Architecture Decision Records (ADRs)

| ADR | Title |
|-----|-------|
| [001](./adr/001-target-platform.md) | Target platform (Gestor Desktop only) |
| [002](./adr/002-order-capture-strategy.md) | Order capture strategy (CDP) |
| [003](./adr/003-print-interception-strategy.md) | Print interception (ipcHandler hook) |
| [004](./adr/004-deprecated-approaches.md) | Deprecated / legacy approaches |

## Specifications

| Spec | Description |
|------|-------------|
| [architecture.md](./spec/architecture.md) | System components and data flow |
| [gestor-desktop-integration.md](./spec/gestor-desktop-integration.md) | Setup steps that work |
| [print-pipeline.md](./spec/print-pipeline.md) | Print flow from Gestor to QR injection |
| [configuration.md](./spec/configuration.md) | `config.json` reference |

## Quick start

1. `npm run dev`
2. `.\scripts\enable-gestor-debug.ps1` (once)
3. `.\scripts\start-gestor-debug.ps1`
4. Print a comanda → see [gestor-desktop-integration.md](./spec/gestor-desktop-integration.md)

## Legacy docs

Older documents (`ARCHITECTURE.md`, `PRINT-BRIDGE-DRIVER.md`) describe superseded approaches. Prefer `docs/spec/` and ADRs above.

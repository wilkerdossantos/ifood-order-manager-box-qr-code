# iFood QR Service — Documentation

## Architecture Decision Records (ADRs)

| ADR | Title |
|-----|-------|
| [001](./adr/001-target-platform.md) | Target platform (Gestor Desktop only) |
| [002](./adr/002-order-capture-strategy.md) | Order capture strategy (CDP) |
| [003](./adr/003-print-interception-strategy.md) | Print interception (virtual printer FILE:) |
| [004](./adr/004-deprecated-approaches.md) | Deprecated / legacy approaches |

## Specifications

| Spec | Description |
|------|-------------|
| [architecture.md](./spec/architecture.md) | System components and data flow |
| [gestor-desktop-integration.md](./spec/gestor-desktop-integration.md) | Setup steps that work |
| [print-pipeline.md](./spec/print-pipeline.md) | Print flow from Gestor to QR injection |
| [configuration.md](./spec/configuration.md) | `config.json` reference |

## Quick start

1. `.\scripts\enable-gestor-debug.ps1` (once)
2. `.\scripts\install-virtual-printer.ps1` (once)
3. `.\scripts\configure-bridge.ps1 -TargetPrinter "Microsoft Print to PDF"`
4. `npm run dev`
5. Print a comanda on "iFood QR Bridge" → see [gestor-desktop-integration.md](./spec/gestor-desktop-integration.md)

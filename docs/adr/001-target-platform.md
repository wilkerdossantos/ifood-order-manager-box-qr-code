# ADR-001: Target Platform

## Status

Accepted (2026-08-28)

## Context

The iFood QR Service must inject pickup QR codes into printed order tickets (comandas). iFood provides multiple client surfaces:

- **Gestor Desktop** — Electron app (`Gestor de Pedidos.exe`), used in restaurants with thermal printers.
- **Gestor Browser** — web app at `gestordepedidos.ifood.com.br`, optionally paired with **Impressora GP iFood** widget (HTTP server on port 4013).
- Legacy experiments: Windows proxy, spooler watchers, RedMon, virtual printers.

Mixing these paths caused confusion and false progress (widget patches applied to Desktop, CDP hooks that never saw prints, etc.).

## Decision

**Primary target: Gestor Desktop only.**

| Surface | In scope? | Notes |
|---------|-----------|-------|
| Gestor Desktop (Electron) | **Yes** | Production path for this project |
| Gestor Browser + Impressora GP widget | **No** | Browser-only; user removed widget to avoid confusion |
| Windows system proxy / spooler / RedMon | **No** | Deprecated (ADR-004) |

## Consequences

- Setup scripts, hooks, and docs describe a single happy path: patched Gestor Desktop + local QR service.
- Printer widget scripts remain in repo but are marked deprecated and exit with error if invoked from main flow.
- Browser-specific HTTP `/print` interception is not maintained for Desktop.

import fs from 'node:fs';
import path from 'node:path';

import type { OrderCache } from './order-cache.js';

const ORDER_HINT = /"(?:displayId|orderId|pickupCode|merchantId|display_id)"\s*:/;

/** Extrai objetos JSON da memória/texto binário (LevelDB, localStorage, etc.). */
export function extractJsonObjectsFromBuffer(raw: Buffer, maxBytes = 4 * 1024 * 1024): unknown[] {
  const text = raw.toString('latin1', 0, Math.min(raw.length, maxBytes));
  return extractJsonObjectsFromText(text);
}

export function extractJsonObjectsFromText(text: string): unknown[] {
  const results: unknown[] = [];
  const seen = new Set<string>();

  let searchFrom = 0;
  while (searchFrom < text.length) {
    const hintIdx = text.slice(searchFrom).search(ORDER_HINT);
    if (hintIdx === -1) break;

    const absoluteHint = searchFrom + hintIdx;
    const start = findJsonStart(text, absoluteHint);
    if (start === -1) {
      searchFrom = absoluteHint + 1;
      continue;
    }

    const extracted = extractBalancedJson(text, start);
    if (extracted) {
      const key = extracted.slice(0, 200);
      if (!seen.has(key)) {
        seen.add(key);
        try {
          results.push(JSON.parse(extracted));
        } catch {
          // not valid json
        }
      }
      searchFrom = start + extracted.length;
    } else {
      searchFrom = absoluteHint + 1;
    }
  }

  return results;
}

function findJsonStart(text: string, nearIndex: number): number {
  for (let i = nearIndex; i >= 0 && i >= nearIndex - 8000; i--) {
    if (text[i] === '{' || text[i] === '[') return i;
  }
  return -1;
}

function extractBalancedJson(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < Math.min(text.length, start + 500_000); i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Parseia blob electron-store / localStorage migrado. */
export function parseElectronStoreContent(parsed: unknown, cache: OrderCache, source: string): number {
  let captured = 0;

  const ingest = (data: unknown) => {
    const orders = cache.ingestPayload(data);
    captured += orders.length;
  };

  if (!parsed || typeof parsed !== 'object') return 0;
  const root = parsed as Record<string, unknown>;

  if (typeof root.localStorage === 'string') {
    try {
      const ls = JSON.parse(root.localStorage) as Record<string, string>;
      for (const [, value] of Object.entries(ls)) {
        if (!value || typeof value !== 'string') continue;
        if (value.startsWith('{') || value.startsWith('[')) {
          try {
            ingest(JSON.parse(value));
          } catch {
            extractJsonObjectsFromText(value).forEach(ingest);
          }
        } else {
          extractJsonObjectsFromText(value).forEach(ingest);
        }
      }
    } catch {
      // ignore
    }
  }

  ingest(parsed);
  extractJsonObjectsFromText(JSON.stringify(parsed)).forEach(ingest);

  if (captured > 0) {
    return captured;
  }
  return 0;
}

export function discoverElectronAppDataPaths(appData: string): string[] {
  const explicit = [
    'Gestor de Pedidos',
    'ifood-order-manager',
    'ifood.order.manager',
    'order-manager',
  ];
  const found = new Set<string>();

  for (const name of explicit) {
    found.add(path.join(appData, name));
  }

  try {
    for (const entry of fs.readdirSync(appData, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/gestor|ifood|order.?manager/i.test(entry.name)) {
        found.add(path.join(appData, entry.name));
      }
    }
  } catch {
    // ignore
  }

  return [...found].filter((p) => fs.existsSync(p));
}

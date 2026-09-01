'use strict';

/**
 * Cliente HTTP para enriquecer comandas via iFood QR Service.
 * CommonJS — usado por enrich-cli.cjs e testes.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PORT = 7420;
const DEFAULT_WAIT_MS = 2000;
const RETRY_INTERVAL_MS = 500;

function loadPrintCacheWaitMs() {
  const env = process.env.IFOOD_QR_PRINT_CACHE_WAIT_MS;
  if (env && !Number.isNaN(Number(env))) {
    return Math.max(0, Number(env));
  }

  const configPath =
    process.env.IFOOD_QR_CONFIG ||
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'iFoodQrService', 'config.json');

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (typeof config.printCacheWaitMs === 'number') {
        return Math.max(0, config.printCacheWaitMs);
      }
    }
  } catch {
    // use default
  }

  return DEFAULT_WAIT_MS;
}

function getHealthPort() {
  return Number(process.env.IFOOD_QR_HEALTH_PORT || DEFAULT_PORT);
}

function httpRequest(options, body) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: data });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, body: '', error: err.message });
    });

    req.setTimeout(7000, () => {
      req.destroy();
      resolve({ status: 0, body: '', error: 'timeout' });
    });

    if (body) req.write(body);
    req.end();
  });
}

async function postEnrich(invoice, printerName, port) {
  const body = JSON.stringify({ invoice, printerName: printerName || '' });
  const res = await httpRequest(
    {
      hostname: '127.0.0.1',
      port,
      path: '/print/enrich',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );

  if (res.error || !res.body) {
    return { ok: false, modified: false, error: res.error || 'empty response' };
  }

  try {
    return JSON.parse(res.body.trim());
  } catch {
    return { ok: false, modified: false, error: 'invalid json' };
  }
}

function extractTextFromInvoice(invoice) {
  if (typeof invoice === 'string') return invoice;
  if (!Array.isArray(invoice)) return '';

  const parts = [];
  for (const item of invoice) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').toLowerCase();

    if (type === 'text') {
      parts.push(String(item.content ?? item.payload ?? ''));
      continue;
    }

    if (type === 'leftright') {
      parts.push(String(item.left ?? item.content?.left ?? ''));
      parts.push(String(item.right ?? item.content?.right ?? ''));
      continue;
    }

    if (type === 'customtable') {
      const rows = item.content || item.rows || [];
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (typeof row === 'string') parts.push(row);
          else if (row && typeof row === 'object') parts.push(String(row.text ?? row.content ?? ''));
        }
      }
      continue;
    }

    if (type === 'table' && Array.isArray(item.content)) {
      for (const row of item.content) {
        if (Array.isArray(row)) parts.push(row.map((cell) => String(cell ?? '')).join(' '));
      }
    }
  }

  return parts.join('\n');
}

function extractDisplayId(invoice) {
  const text = extractTextFromInvoice(invoice);
  const match = String(text || '').match(/#\s*(\d{3,6})/);
  return match ? match[1] : null;
}

async function getOrder(displayId, port) {
  const encoded = encodeURIComponent(displayId);
  const res = await httpRequest({
    hostname: '127.0.0.1',
    port,
    path: `/orders/${encoded}`,
    method: 'GET',
  });

  if (res.status !== 200 || !res.body) return null;
  try {
    const parsed = JSON.parse(res.body.trim());
    return parsed.error ? null : parsed;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enrichWithRetry(invoice, printerName, options = {}) {
  const port = options.port ?? getHealthPort();
  const waitMs = options.waitMs ?? loadPrintCacheWaitMs();
  const deadline = Date.now() + waitMs;
  let lastResult = null;
  const lookupText = extractTextFromInvoice(invoice);

  while (Date.now() <= deadline) {
    lastResult = await postEnrich(lookupText, printerName, port);

    if (lastResult.modified) {
      return lastResult;
    }

    if (lastResult.ok === false && lastResult.error === 'timeout') {
      break;
    }

    const displayId = extractDisplayId(lookupText);
    if (displayId && !(await getOrder(displayId, port))) {
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    if (lastResult.ok !== false) {
      return lastResult;
    }

    await sleep(RETRY_INTERVAL_MS);
  }

  return (
    lastResult || {
      ok: false,
      modified: false,
      invoice,
      error: 'service unavailable',
    }
  );
}

module.exports = {
  enrichWithRetry,
  postEnrich,
  getOrder,
  extractDisplayId,
  extractTextFromInvoice,
  loadPrintCacheWaitMs,
  getHealthPort,
  sleep,
};

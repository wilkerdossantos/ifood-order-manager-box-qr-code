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

function extractDisplayId(invoice) {
  const match = String(invoice || '').match(/#\s*(\d{3,6})/);
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

  while (Date.now() <= deadline) {
    lastResult = await postEnrich(invoice, printerName, port);

    if (lastResult.modified) {
      return lastResult;
    }

    if (lastResult.ok === false && lastResult.error === 'timeout') {
      break;
    }

    const displayId = extractDisplayId(invoice);
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
  loadPrintCacheWaitMs,
  getHealthPort,
  sleep,
};

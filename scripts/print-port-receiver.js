#!/usr/bin/env node
/**
 * Receptor de impressão para RedMon / port monitor.
 *
 * RedMon chama: node print-port-receiver.js <arquivo-spool>
 * Teste manual: Get-Content invoice.txt -Raw | node print-port-receiver.js --stdin
 *
 * Requer iFood QR Service rodando (porta 7420).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEALTH_PORT = Number(process.env.IFOOD_QR_HEALTH_PORT || 7420);
const CONFIG_PATH =
  process.env.IFOOD_QR_CONFIG ||
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'iFoodQrService', 'config.json');

function loadConfig() {
  const defaults = {
    printerName: 'iFood QR Bridge',
    targetPrinterName: '',
    healthPort: HEALTH_PORT,
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
    }
  } catch {
    // use defaults
  }
  return defaults;
}

function readInputBytes(args) {
  if (args.includes('--stdin')) {
    return fs.readFileSync(0);
  }
  const fileArg = args.find((a) => !a.startsWith('-'));
  if (!fileArg) {
    console.error('Usage: print-port-receiver.js <spool-file> | --stdin');
    process.exit(2);
  }
  return fs.readFileSync(fileArg);
}

function bufferToInvoiceText(buf) {
  return Buffer.from(buf).toString('latin1');
}

function enrichViaHttp(invoice, printerName, port) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ invoice, printerName });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/print/enrich',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 8000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, invoice, modified: false });
          }
        });
      },
    );
    req.on('error', () => resolve({ ok: false, invoice, modified: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, invoice, modified: false });
    });
    req.write(body);
    req.end();
  });
}

function forwardRaw(enrichedLatin1, targetPrinter) {
  const forwardScript = path.join(__dirname, 'forward-raw-print.ps1');
  const tmpFile = path.join(
    process.env.TEMP || 'C:\\Windows\\Temp',
    `ifood-qr-${Date.now()}.raw`,
  );

  fs.writeFileSync(tmpFile, Buffer.from(enrichedLatin1, 'latin1'));

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      forwardScript,
      '-PrinterName',
      targetPrinter,
      '-FilePath',
      tmpFile,
    ],
    { encoding: 'utf-8', timeout: 30000, windowsHide: true },
  );

  try {
    fs.unlinkSync(tmpFile);
  } catch {
    // ignore
  }

  if (result.status !== 0) {
    console.error('[print-port-receiver] forward failed:', result.stderr || result.stdout);
    return false;
  }
  return true;
}

async function main() {
  const config = loadConfig();
  const port = config.healthPort || HEALTH_PORT;
  const targetPrinter = config.targetPrinterName || process.env.IFOOD_QR_TARGET_PRINTER || '';

  if (!targetPrinter) {
    console.error('[print-port-receiver] targetPrinterName não configurado em config.json');
    process.exit(1);
  }

  const raw = readInputBytes(process.argv.slice(2));
  const invoice = bufferToInvoiceText(raw);

  console.log('[print-port-receiver] Job recebido', {
    bytes: raw.length,
    target: targetPrinter,
  });

  const detail = await enrichViaHttp(invoice, config.printerName || 'iFood QR Bridge', port);

  const finalInvoice = detail.modified ? detail.invoice : invoice;

  if (detail.modified) {
    console.log('[print-port-receiver] QR adicionado —', detail.payload || '');
    if (detail.previewPath) {
      console.log('[print-port-receiver] Preview:', detail.previewPath);
    }
  } else {
    console.warn('[print-port-receiver] Comanda não modificada — pedido fora do cache?');
  }

  const ok = forwardRaw(finalInvoice, targetPrinter);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[print-port-receiver] fatal:', err);
  process.exit(1);
});

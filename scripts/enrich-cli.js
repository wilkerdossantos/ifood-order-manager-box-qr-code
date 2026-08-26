#!/usr/bin/env node
/**
 * CLI síncrona: lê JSON do stdin, chama /print/enrich, escreve JSON no stdout.
 * Usada pelo print-main-hook.cjs no processo principal do Electron.
 */
import http from 'node:http';

const PORT = Number(process.env.IFOOD_QR_HEALTH_PORT || 7420);

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function postEnrich(body) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/print/enrich',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 7000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      },
    );

    req.on('error', () => resolve(''));
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
    req.write(body);
    req.end();
  });
}

const input = await readStdin();
let parsed;
try {
  parsed = JSON.parse(input);
} catch {
  process.stdout.write(JSON.stringify({ ok: false, modified: false, error: 'invalid stdin' }));
  process.exit(1);
}

const body = JSON.stringify({
  invoice: parsed.invoice || '',
  printerName: parsed.printerName || '',
});

const response = await postEnrich(body);
if (response) {
  process.stdout.write(response.trim());
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    ok: false,
    modified: false,
    invoice: parsed.invoice,
    error: 'service unavailable',
  }),
);
process.exit(1);

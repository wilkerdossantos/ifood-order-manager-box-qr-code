#!/usr/bin/env node
/**
 * Cliente CLI para o Print Bridge (named pipe).
 * Uso: node scripts/print-bridge-client.js --invoice "PEDIDO: #6798\n..."
 */
import fs from 'node:fs';
import net from 'node:net';

const args = process.argv.slice(2);
const invoiceIdx = args.indexOf('--invoice');
const fileIdx = args.indexOf('--file');
const pipeName = args.includes('--pipe')
  ? args[args.indexOf('--pipe') + 1]
  : 'ifood-qr-service';

const pipePath =
  process.platform === 'win32' ? `\\\\.\\pipe\\${pipeName}` : `/tmp/${pipeName}.sock`;

let invoice = '';
if (fileIdx >= 0) {
  invoice = fs.readFileSync(args[fileIdx + 1], 'utf-8');
} else if (invoiceIdx >= 0) {
  invoice = args[invoiceIdx + 1];
} else {
  console.error('Usage: print-bridge-client.js --invoice "..." | --file invoice.txt');
  process.exit(1);
}

const client = net.connect(pipePath, () => {
  client.write(`${JSON.stringify({ action: 'enrich', invoice })}\n`);
});

let data = '';
client.on('data', (chunk) => {
  data += chunk.toString('utf-8');
  const line = data.split('\n')[0];
  if (line) {
    const response = JSON.parse(line);
    console.log(JSON.stringify(response, null, 2));
    client.end();
    process.exit(response.ok ? 0 : 1);
  }
});

client.on('error', (err) => {
  console.error('Print bridge error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout');
  process.exit(1);
}, 5000);

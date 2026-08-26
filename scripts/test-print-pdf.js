#!/usr/bin/env node
/**
 * Testa enriquecimento de comanda em modo PDF (Microsoft Print to PDF).
 * Uso: node scripts/test-print-pdf.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEALTH_PORT = 7420;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invoiceSample = fs.readFileSync(
  path.join(__dirname, '../docs/fixtures/invoice-sample.txt'),
  'utf-8',
);

async function post(pathname, body) {
  const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  console.log('=== Teste de impressão PDF (Microsoft Print to PDF) ===\n');

  try {
    await fetch(`http://127.0.0.1:${HEALTH_PORT}/health`);
  } catch {
    console.error('✗ Serviço não está rodando. Execute: npm run dev');
    process.exit(1);
  }

  const fixture = {
    events: [
      {
        order: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          displayId: '6798',
          orderType: 'TAKEOUT',
          merchant: { id: 'merchant-test-001', name: 'Restaurante Teste' },
          delivery: { pickupCode: 'XY12' },
        },
      },
    ],
  };

  await post('/ingest', fixture);

  const result = await post('/print/enrich', {
    invoice: invoiceSample,
    printerName: 'Microsoft Print to PDF',
  });

  console.log('Resultado:');
  console.log('  modified:   ', result.modified);
  console.log('  pdfMode:    ', result.pdfMode);
  console.log('  payload:    ', result.payload);
  console.log('  previewPath:', result.previewPath);

  if (result.modified && result.invoice) {
    const qrSection = result.invoice.split('QR:')[1] || '';
    console.log('\n--- Trecho QR na comanda ---');
    console.log('QR:' + qrSection.trim().slice(0, 200));
  }

  if (result.previewPath && fs.existsSync(result.previewPath)) {
    console.log('\n✓ Abra o preview para ver a comanda completa:');
    console.log(' ', result.previewPath);
  }

  console.log('\n=== OK — use Microsoft Print to PDF no Gestor para o mesmo efeito ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

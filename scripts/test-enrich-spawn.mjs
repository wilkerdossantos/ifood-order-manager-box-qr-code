import { spawnSync } from 'node:child_process';
import path from 'node:path';

const escpos = [
  { type: 'text', content: 'PEDIDO: #3676817\nCliente: Teste\nTotal: R$ 25,00', align: 'center' },
  { type: 'text', content: 'iFood', align: 'center' },
];

function extractTextFromInvoice(invoice) {
  if (typeof invoice === 'string') return invoice;
  if (!Array.isArray(invoice)) return '';
  const parts = [];
  for (const item of invoice) {
    if (!item || typeof item !== 'object') continue;
    if (String(item.type || '').toLowerCase() === 'text') {
      parts.push(String(item.content ?? item.payload ?? ''));
    }
  }
  return parts.join('\n');
}

const lookupText = extractTextFromInvoice(escpos);
console.log('lookupText:', lookupText);

const ENRICH_CLI = path.join(
  process.env.ProgramData || 'C:\\ProgramData',
  'iFoodQrService/scripts/enrich-cli.cjs',
);
const electron = 'C:\\Program Files (x86)\\Gestor de Pedidos\\Gestor de Pedidos.exe';

const input = JSON.stringify({ invoice: lookupText, printerName: 'Microsoft Print to PDF', port: 7420 });
const result = spawnSync(electron, [ENRICH_CLI], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', IFOOD_QR_HEALTH_PORT: '7420' },
  input,
  encoding: 'utf-8',
  timeout: 15000,
  windowsHide: true,
});

console.log('status:', result.status);
console.log('stdout:', result.stdout?.slice(0, 300));
console.log('stderr:', result.stderr?.slice(0, 300));

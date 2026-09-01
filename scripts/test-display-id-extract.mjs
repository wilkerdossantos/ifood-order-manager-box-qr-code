/**
 * Test order ID extraction from realistic Gestor EscPos text.
 */
import { extractDisplayIdFromInvoice } from '../src/utils/strings.js';

const samples = [
  'PEDIDO: #3676817\nCliente: Teste',
  'NÚMERO DO PEDIDO: #3676817',
  'NUMERO DO PEDIDO: #3676817',
  '#3676817',
  '3676817',
  'shortReference in header only\n3676817',
];

// Simulate EscPos array extraction like gestor-ipc-print-hook
function extractFromEscPos(invoice) {
  if (typeof invoice === 'string') return invoice;
  const parts = [];
  for (const item of invoice) {
    if (item?.type === 'text') parts.push(String(item.content ?? ''));
    if (item?.type === 'leftright') {
      parts.push(String(item.left ?? ''));
      parts.push(String(item.right ?? ''));
    }
    if (item?.type === 'customTable' && Array.isArray(item.content)) {
      for (const row of item.content) {
        if (row?.text) parts.push(String(row.text));
      }
    }
  }
  return parts.join('\n');
}

const realisticEscPos = [
  { type: 'text', content: 'iFood', align: 'center' },
  { type: 'text', content: 'Restaurante Teste', align: 'center' },
  { type: 'horizontalLine' },
  { type: 'text', content: '3676817', align: 'center', size: [3, 3] },
  { type: 'horizontalLine' },
  { type: 'text', content: 'NÚMERO DO PEDIDO: #3676817', align: 'center' },
];

const text = extractFromEscPos(realisticEscPos);
console.log('Extracted text:\n', text);
console.log('displayId:', extractDisplayIdFromInvoice(text));

for (const s of samples) {
  console.log(JSON.stringify(s.slice(0, 50)), '->', extractDisplayIdFromInvoice(s));
}

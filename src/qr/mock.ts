import { randomInt } from 'node:crypto';

import type { OrderData } from '../config/types.js';

/**
 * Gera um pedido mock para apresentação (Move 2026). Os campos fixos simulam
 * um pedido real (merchantId, orderType, orderId); apenas displayId e
 * pickupCode variam a cada chamada, garantindo que cada reimpressão produza
 * códigos de abertura de box diferentes.
 */
export function generateMockOrder(): OrderData {
  return {
    merchantId: 'cbe4ca5b-d2f8-4720-a030-34a1dfea6fa5',
    displayId: String(randomInt(1000, 10000)), // 4 dígitos
    pickupCode: String(randomInt(1000, 10000)), // 4 dígitos
    orderType: 'DELIVERY',
    orderId: '00000000-0000-0000-0000-000000000000',
  };
}

/**
 * Substitui, no texto da comanda, os tokens visíveis do pedido pelos valores
 * mock: número do pedido (linha rotulada, "hash" isolado ou shortReference de
 * 4–8 dígitos no cabeçalho) vira o displayId mock; o código de retirada
 * (CÓDIGO DE COLETA / CÓDIGO DE RETIRADA) vira o pickupCode mock.
 */
export function replaceMockTokens(text: string, order: OrderData): string {
  const displayId = order.displayId || '0000';
  const pickupCode = order.pickupCode || '0000';

  let out = String(text)
    .replace(
      // Linhas rotuladas: "PEDIDO: #6798" / "NÚMERO DO PEDIDO: #6798".
      /(^\s*(?:N[UÚ]MERO\s+DO\s+PEDIDO|PEDIDO)\s*:?\s*#?)\s*([A-Z0-9-]{3,})/im,
      (_m, prefix) => `${prefix}${displayId}`,
    )
    // "Hash" isolado: "#6798".
    .replace(/^(\s*#)\s*[0-9]{3,8}\s*$/m, `$1${displayId}`)
    // Código de retirada: "CÓDIGO DE COLETA: XY12".
    .replace(
      /(C[ÓO]DIGO\s+DE\s+(?:COLETA|RETIRADA)\s*:?\s*)[^\n]*/i,
      (_m, prefix) => `${prefix}${pickupCode}`,
    );

  // shortReference isolado (4–8 dígitos) no cabeçalho, antes das seções
  // (mesmo critério de extractDisplayIdFromInvoice).
  const stopSection = /^(ITENS|ITEMS|DATA:|ENTREGA|RETIRADA|SERVIR|RESUMO|TOTAL)/i;
  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (stopSection.test(trimmed)) break;
    if (/^[0-9]{4,8}$/.test(trimmed)) {
      lines[i] = lines[i].replace(trimmed, displayId);
      break;
    }
  }
  out = lines.join('\n');

  return out;
}

/**
 * Reescreve a comanda impressa com os valores mock. Além de trocar os tokens
 * (replaceMockTokens), garante a linha do código de retirada na impressão:
 * se a comanda não trouxer CÓDIGO DE COLETA/RETIRADA, insere uma após o
 * marcador RETIRADA (ou ao final, na falta dele).
 */
export function applyMockToInvoice(invoice: string, order: OrderData): string {
  const pickupCode = order.pickupCode || '0000';
  let out = replaceMockTokens(invoice, order);

  if (!/C[ÓO]DIGO\s+DE\s+(?:COLETA|RETIRADA)/i.test(out)) {
    const marker = out.search(/^\s*RETIRADA\s*$/im);
    if (marker !== -1) {
      const lineEnd = out.indexOf('\n', marker);
      const at = lineEnd === -1 ? out.length : lineEnd + 1;
      out = out.slice(0, at) + `CÓDIGO DE RETIRADA: ${pickupCode}\n` + out.slice(at);
    } else {
      out = out.replace(/\s*$/, `\nCÓDIGO DE RETIRADA: ${pickupCode}\n`);
    }
  }

  return out;
}

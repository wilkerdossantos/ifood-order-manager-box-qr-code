import { describe, expect, it } from 'vitest';

import { applyMockToInvoice, generateMockOrder, replaceMockTokens } from './mock.js';
import type { OrderData } from '../config/types.js';

const fixedOrder: OrderData = {
  merchantId: 'cbe4ca5b-d2f8-4720-a030-34a1dfea6fa5',
  displayId: '8419',
  pickupCode: '1736',
  orderType: 'DELIVERY',
  orderId: '00000000-0000-0000-0000-000000000000',
};

describe('generateMockOrder', () => {
  it('mantém campos fixos realistas e varia displayId/pickupCode', () => {
    const order = generateMockOrder();
    expect(order.merchantId).toBe('cbe4ca5b-d2f8-4720-a030-34a1dfea6fa5');
    expect(order.orderType).toBe('DELIVERY');
    expect(order.orderId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('gera displayId e pickupCode aleatórios de 4 dígitos', () => {
    const first = generateMockOrder();
    const second = generateMockOrder();

    expect(first.displayId).not.toBe(second.displayId);
    expect(first.pickupCode).not.toBe(second.pickupCode);

    expect(first.displayId).toMatch(/^\d{4}$/);
    expect(first.pickupCode).toMatch(/^\d{4}$/);
  });
});

describe('replaceMockTokens', () => {
  it('substitui número do pedido e código de retirada em linha rotulada', () => {
    const out = replaceMockTokens('PEDIDO: #6798', fixedOrder);
    expect(out).toBe('PEDIDO: #8419');
  });

  it('substitui shortReference isolado e linha NÚMERO DO PEDIDO (Gestor v2)', () => {
    const invoice = [
      '        iFood',
      '    Restaurante Teste',
      '    --------------------------------',
      '    6798',
      '    --------------------------------',
      '    NÚMERO DO PEDIDO: #6798',
      '    CÓDIGO DE COLETA: XY12',
    ].join('\n');
    const out = replaceMockTokens(invoice, fixedOrder);
    expect(out).toContain('\n    8419\n');
    expect(out).toContain('NÚMERO DO PEDIDO: #8419');
    expect(out).toContain('CÓDIGO DE COLETA: 1736');
    expect(out).not.toContain('6798');
    expect(out).not.toContain('XY12');
  });
});

describe('applyMockToInvoice', () => {
  it('substitui o número do pedido e inclui o código de retirada na impressão', () => {
    const invoice = [
      '        iFood',
      '    Restaurante Teste',
      '    --------------------------------',
      '    PEDIDO: #6798',
      '    DATA: 26/08/2026 13:00',
      '    RETIRADA',
      '    CÓDIGO DE COLETA: XY12',
      '    --------------------------------',
      '    ITENS:',
      '    1x X-Burger',
    ].join('\n');

    const out = applyMockToInvoice(invoice, fixedOrder);
    expect(out).toContain('PEDIDO: #8419');
    expect(out).toContain('CÓDIGO DE COLETA: 1736');
    expect(out).not.toContain('#6798');
    expect(out).not.toContain('XY12');
  });

  it('adiciona a linha de código de retirada quando a comanda não tem', () => {
    const invoice = 'PEDIDO: #6798\nRETIRADA\nITENS:\n1x X-Burger\n';
    const out = applyMockToInvoice(invoice, fixedOrder);
    expect(out).toContain('PEDIDO: #8419');
    expect(out).toContain('CÓDIGO DE RETIRADA: 1736');
  });
});

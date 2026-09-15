import { describe, expect, it } from 'vitest';

import { generateMockOrder, mockQrHeader } from './mock.js';
import type { OrderData } from '../config/types.js';

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

describe('mockQrHeader', () => {
  it('monta Número do Pedido e Código de Retirada em duas linhas', () => {
    const order: OrderData = {
      merchantId: 'cbe4ca5b-d2f8-4720-a030-34a1dfea6fa5',
      displayId: '8419',
      pickupCode: '1736',
      orderType: 'DELIVERY',
      orderId: '00000000-0000-0000-0000-000000000000',
    };
    expect(mockQrHeader(order)).toBe('Número do Pedido: 8419\nCódigo de Retirada: 1736');
  });
});

import { describe, expect, it } from 'vitest';

import { generateMockOrder } from './mock.js';

describe('generateMockOrder', () => {
  it('mantém campos fixos como "mock"', () => {
    const order = generateMockOrder();
    expect(order.merchantId).toBe('mock');
    expect(order.orderType).toBe('mock');
    expect(order.orderId).toBe('mock');
  });

  it('gera displayId e pickupCode aleatórios (variam entre chamadas)', () => {
    const first = generateMockOrder();
    const second = generateMockOrder();

    expect(first.displayId).not.toBe(second.displayId);
    expect(first.pickupCode).not.toBe(second.pickupCode);

    // Formatos esperados: displayId e pickupCode de 4 dígitos.
    expect(first.displayId).toMatch(/^\d{4}$/);
    expect(first.pickupCode).toMatch(/^\d{4}$/);
  });
});

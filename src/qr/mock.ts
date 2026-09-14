import { randomInt } from 'node:crypto';

import type { OrderData } from '../config/types.js';

/**
 * Gera um pedido mock para apresentação (Move 2026). Os campos fixos ficam como
 * 'mock'; apenas displayId e pickupCode variam a cada chamada, garantindo que
 * cada reimpressão produza códigos de abertura de box diferentes.
 */
export function generateMockOrder(): OrderData {
  return {
    merchantId: 'mock',
    displayId: String(randomInt(100000, 1000000)), // 6 dígitos
    pickupCode: String(randomInt(100, 10000)), // 3–4 dígitos
    orderType: 'mock',
    orderId: 'mock',
  };
}

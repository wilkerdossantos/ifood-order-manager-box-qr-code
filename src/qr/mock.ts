import { randomInt } from 'node:crypto';

import type { OrderData } from '../config/types.js';

/**
 * Gera um pedido mock para apresentação (Move 2026). Os campos fixos ficam como
 * 'mock'; apenas displayId e pickupCode variam a cada chamada, garantindo que
 * cada reimpressão produza códigos de abertura de box diferentes.
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

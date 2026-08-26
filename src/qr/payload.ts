import type { OrderData } from '../config/types.js';

export function generateQrPayload(data: Partial<OrderData>): string {
  return `LOJA:${data.merchantId || 'N/A'}|NP:${data.displayId || 'N/A'}|CR:${data.pickupCode || 'N/A'}|TIPO:${data.orderType || 'N/A'}|ID:${data.orderId || 'N/A'}`;
}

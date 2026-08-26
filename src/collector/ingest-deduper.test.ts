import { describe, expect, it, beforeEach } from 'vitest';

import { IngestDeduper } from './ingest-deduper.js';

describe('IngestDeduper', () => {
  let deduper: IngestDeduper;

  beforeEach(() => {
    deduper = new IngestDeduper(1000);
  });

  it('allows first ingest for an order', () => {
    const orders = [
      {
        merchantId: 'm1',
        displayId: '6798',
        pickupCode: 'XY',
        orderType: 'TAKEOUT',
        orderId: 'id-1',
      },
    ];
    expect(deduper.shouldIngest(orders)).toBe(true);
  });

  it('blocks duplicate ingest within window', () => {
    const orders = [
      {
        merchantId: 'm1',
        displayId: '6798',
        pickupCode: 'XY',
        orderType: 'TAKEOUT',
        orderId: 'id-1',
      },
    ];
    expect(deduper.shouldIngest(orders)).toBe(true);
    expect(deduper.shouldIngest(orders)).toBe(false);
  });

  it('returns false for empty orders', () => {
    expect(deduper.shouldIngest([])).toBe(false);
  });
});

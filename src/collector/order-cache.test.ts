import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { OrderCache } from '../../src/collector/order-cache.js';
import pollingFixture from '../../docs/fixtures/polling-response.json' with { type: 'json' };
import orderFixture from '../../docs/fixtures/order-detail.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invoiceSample = fs.readFileSync(
  path.join(__dirname, '../../docs/fixtures/invoice-sample.txt'),
  'utf-8',
);

describe('OrderCache', () => {
  let cachePath: string;
  let cache: OrderCache;

  beforeEach(() => {
    cachePath = path.join(os.tmpdir(), `qr-cache-test-${Date.now()}.json`);
    cache = new OrderCache(cachePath);
  });

  afterEach(() => {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  });

  it('ingests polling response and retrieves by displayId', () => {
    const captured = cache.ingestPayload(pollingFixture);
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].displayId).toBe('6798');
    expect(captured[0].pickupCode).toBe('XY12');
    expect(captured[0].orderType).toBe('RETIRADA');

    const found = cache.getOrder('6798');
    expect(found?.merchantId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('ingests order detail response', () => {
    cache.ingestPayload(orderFixture);
    const found = cache.getOrder('6798');
    expect(found?.orderType).toBe('DELIVERY');
    expect(found?.pickupCode).toBe('AB99');
  });

  it('finds order in invoice text', () => {
    cache.ingestPayload(pollingFixture);
    const found = cache.findOrderInInvoice(invoiceSample);
    expect(found?.displayId).toBe('6798');
  });

  it('extracts order from invoice when cache is empty', () => {
    const extracted = cache.extractOrderFromInvoiceText(invoiceSample);
    expect(extracted?.displayId).toBe('6798');
    expect(extracted?.pickupCode).toBe('XY12');
    expect(extracted?.orderType).toBe('RETIRADA');
  });

  it('persists cache to disk', () => {
    cache.ingestPayload(pollingFixture);
    cache.flush();

    const cache2 = new OrderCache(cachePath);
    const found = cache2.getOrder('6798');
    expect(found?.displayId).toBe('6798');
  });
});

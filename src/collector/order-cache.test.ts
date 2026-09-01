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

<<<<<<< HEAD
  it('rejects non-order payloads (shipping config, promotions, webpack chunks)', () => {
    // Config de shipping/promoção (não é pedido — não tem displayId real).
    const shipping = {
      promotions: [{ id: '87a588fe-2ce8-4646-9e68-8972cee584a7', name: 'Desconto' }],
      dedicatedFleet: { bookings: [], enabled: false },
    };
    // Config de merchant com um `id` numérico (não é displayId).
    const merchantConfig = { id: '2906624', name: 'Loja' };
    // Chunk webpack (id = nome de chunk).
    const webpackChunk = { id: 'orderDisplay_1787164354842' };

    expect(cache.ingestPayload(shipping)).toEqual([]);
    expect(cache.ingestPayload(merchantConfig)).toEqual([]);
    expect(cache.ingestPayload(webpackChunk)).toEqual([]);
    expect(cache.getStats().uniqueOrders).toBe(0);
  });

  it('does not treat a UUID-only object as a displayId', () => {
    // Um pedido cujo único `id` é um UUID (sem displayId) não deve virar
    // "pedido" com displayId = UUID (ex.: 12a61141-63f0-46fe-9507...).
    const uuidOnly = { id: '12a61141-63f0-46fe-9507-c1e4a5bc8188', orderType: 'DINE_IN' };
    expect(cache.ingestPayload(uuidOnly)).toEqual([]);
  });

=======
>>>>>>> origin/main
  it('finds order in Gestor v2 invoice format', () => {
    const gestorV2 = fs.readFileSync(
      path.join(__dirname, '../../docs/fixtures/invoice-gestor-v2.txt'),
      'utf-8',
    );
    cache.ingestPayload(pollingFixture);
    const found = cache.findOrderInInvoice(gestorV2);
    expect(found?.displayId).toBe('6798');
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

  it('purges expired orders on persist when TTL configured', () => {
    const staleFile = path.join(os.tmpdir(), `qr-cache-ttl-${Date.now()}.json`);
    const staleCache = new OrderCache(staleFile, { cacheMaxAgeHours: 1 });
    staleCache.ingestPayload(pollingFixture);
    staleCache.flush();

    const data = JSON.parse(fs.readFileSync(staleFile, 'utf-8')) as {
      orders: Array<{ capturedAt?: string }>;
    };
    data.orders[0].capturedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(staleFile, JSON.stringify(data));

    const reloaded = new OrderCache(staleFile, { cacheMaxAgeHours: 1 });
    reloaded.flush();
    const after = JSON.parse(fs.readFileSync(staleFile, 'utf-8')) as { orders: unknown[] };
    expect(after.orders.length).toBe(0);

    if (fs.existsSync(staleFile)) fs.unlinkSync(staleFile);
  });
});

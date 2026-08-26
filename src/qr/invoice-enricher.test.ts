import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { OrderCache } from '../collector/order-cache.js';
import type { ServiceConfig } from '../config/types.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { InvoiceEnricher } from './invoice-enricher.js';
import pollingFixture from '../../docs/fixtures/polling-response.json' with { type: 'json' };

const invoiceSample = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), '../../docs/fixtures/invoice-sample.txt'),
  'utf-8',
);

describe('InvoiceEnricher', () => {
  let cachePath: string;
  let cache: OrderCache;
  let enricher: InvoiceEnricher;
  let config: ServiceConfig;

  beforeEach(() => {
    cachePath = path.join(os.tmpdir(), `qr-enrich-test-${Date.now()}.json`);
    cache = new OrderCache(cachePath);
    config = { ...DEFAULT_CONFIG, enabled: true, pdfMode: false, cachePath };
    enricher = new InvoiceEnricher(cache, config);
    cache.ingestPayload(pollingFixture);
  });

  afterEach(() => {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  });

  it('enriches invoice with ESC/POS QR', async () => {
    const enriched = await enricher.enrichInvoice(invoiceSample);
    expect(enriched).toContain('6798');
    expect(enriched.length).toBeGreaterThan(invoiceSample.length);
  });

  it('uses readable text for PDF printers', async () => {
    const enriched = await enricher.enrichInvoice(invoiceSample, {
      printerName: 'Microsoft Print to PDF',
    });
    expect(enriched).toContain('QR:');
    expect(enriched).toContain('LOJA:');
    expect(enriched).not.toContain('\x1d(');
  });

  it('enriches print body JSON', async () => {
    const body = JSON.stringify({
      invoice: invoiceSample,
      orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    const result = await enricher.enrichPrintBody(body);
    const parsed = JSON.parse(result);
    expect(parsed.invoice.length).toBeGreaterThan(invoiceSample.length);
  });

  it('returns original invoice when disabled', async () => {
    const disabled = new InvoiceEnricher(cache, { ...config, enabled: false });
    const result = await disabled.enrichInvoice(invoiceSample);
    expect(result).toBe(invoiceSample);
  });
});

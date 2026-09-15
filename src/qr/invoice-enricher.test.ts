import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { OrderCache } from '../collector/order-cache.js';
import type { ServiceConfig } from '../config/types.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { InvoiceEnricher } from './invoice-enricher.js';
import pollingFixture from '../../docs/fixtures/polling-response.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const invoiceSample = fs.readFileSync(
  path.join(__dirname, '../../docs/fixtures/invoice-sample.txt'),
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

  it('enriches Gestor Desktop v2 invoice format (shortReference + NÚMERO DO PEDIDO)', async () => {
    const gestorV2 = fs.readFileSync(
      path.join(__dirname, '../../docs/fixtures/invoice-gestor-v2.txt'),
      'utf-8',
    );
    const enriched = await enricher.enrichInvoice(gestorV2);
    expect(enriched).toContain('6798');
    expect(enriched.length).toBeGreaterThan(gestorV2.length);
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

  it('generates mock payload with varying displayId/pickupCode when mockMode is enabled', async () => {
    const mockEnricher = new InvoiceEnricher(cache, { ...config, mockMode: true });

    const first = await mockEnricher.enrichInvoiceDetailed(invoiceSample, {
      printerName: 'Microsoft Print to PDF',
    });
    const second = await mockEnricher.enrichInvoiceDetailed(invoiceSample, {
      printerName: 'Microsoft Print to PDF',
    });

    expect(first.payload).toContain('LOJA:cbe4ca5b-d2f8-4720-a030-34a1dfea6fa5');
    expect(first.payload).toContain('TIPO:DELIVERY');
    // Códigos variam entre reimpressões.
    expect(first.payload).not.toBe(second.payload);
  });

  it('rewrites printed invoice to mock order (order number + pickup code) in mockMode', async () => {
    const mockEnricher = new InvoiceEnricher(cache, { ...config, mockMode: true });

    const detail = await mockEnricher.enrichInvoiceDetailed(invoiceSample, {
      printerName: 'Microsoft Print to PDF',
    });

    const displayId = detail.order!.displayId;
    const pickupCode = detail.order!.pickupCode;

    // Texto impresso reflete o pedido mock, não o número real (#6798).
    expect(detail.invoice).toContain(`PEDIDO: #${displayId}`);
    expect(detail.invoice).toContain(`CÓDIGO DE COLETA: ${pickupCode}`);
    expect(detail.invoice).not.toContain('#6798');
    expect(detail.invoice).not.toContain('XY12');
  });

  it('returns original invoice when disabled', async () => {
    const disabled = new InvoiceEnricher(cache, { ...config, enabled: false });
    const result = await disabled.enrichInvoice(invoiceSample);
    expect(result).toBe(invoiceSample);
  });
});

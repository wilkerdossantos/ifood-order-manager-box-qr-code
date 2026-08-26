import { describe, expect, it } from 'vitest';

import { generateEscPosQr, injectThermalQr, latin1Encode, stripEscPosToText } from '../../src/qr/escpos.js';
import { generateQrPayload } from '../../src/qr/payload.js';

describe('QR Engine', () => {
  it('generates pipe-delimited payload', () => {
    const payload = generateQrPayload({
      merchantId: '11111111-2222-3333-4444-555555555555',
      displayId: '6798',
      pickupCode: 'XY12',
      orderType: 'RETIRADA',
      orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(payload).toBe(
      'LOJA:11111111-2222-3333-4444-555555555555|NP:6798|CR:XY12|TIPO:RETIRADA|ID:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });

  it('generates ESC/POS QR commands', () => {
    const payload = 'LOJA:test|NP:1234|CR:XY|TIPO:RETIRADA|ID:abc';
    const escpos = generateEscPosQr(payload);
    expect(escpos).toContain('\x1d\x28\x6b');
    expect(escpos).toContain('\x1ba\x01');
    expect(latin1Encode('test')).toBe('test');
  });

  it('strips ESC/POS control chars for readable text', () => {
    const raw = '\x1ba\x01PEDIDO: #6798\n\x1ba\x00';
    expect(stripEscPosToText(raw)).toContain('PEDIDO: #6798');
  });

  it('injects thermal QR into invoice', () => {
    const invoice = 'PEDIDO: #6798\n';
    const enriched = injectThermalQr(invoice, 'LOJA:x|NP:6798|CR:Y|TIPO:RETIRADA|ID:z');
    expect(enriched.length).toBeGreaterThan(invoice.length);
    expect(enriched).toContain('────────────────');
  });
});

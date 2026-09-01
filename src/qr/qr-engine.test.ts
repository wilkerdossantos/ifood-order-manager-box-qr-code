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

  it('injects thermal QR BEFORE the cut command (GS V)', () => {
    // Fluxo real do Totem: texto + feed + corte (GS V 0) + init (ESC @).
    const invoice = 'EXPEDICAO\n0238\n\x1b\x64\x04\x1b\x64\x04\x1d\x56\x00\x1b\x40';
    const enriched = injectThermalQr(invoice, 'LOJA:x|NP:0238|CR:Y|TIPO:DINE_IN|ID:z');

    // O QR deve ficar antes do corte, não depois.
    const qrIdx = enriched.indexOf('────────────────');
    const cutIdx = enriched.indexOf('\x1d\x56');
    expect(qrIdx).toBeGreaterThan(-1);
    expect(cutIdx).toBeGreaterThan(qrIdx);

    // O init (ESC @) permanece no final.
    expect(enriched.endsWith('\x1b\x40')).toBe(true);
  });

  it('injects thermal QR BEFORE the Gestor footer (avoid half-cut QR)', () => {
    // Fluxo real do Gestor: itens + total + rodapé "Gestor Web ... - Desktop ..."
    // + feed + corte. O QR deve entrar ANTES do rodapé, para o cortador não
    // cortá-lo no meio.
    const invoice =
      'Valor total do pedido: R$ 0,00\n' +
      '       Gestor Web 9.339.0 - Desktop 8.10.0        \n' +
      '\x1b\x64\x04\x1b\x64\x04\x1d\x56\x00\x1b\x40';
    const enriched = injectThermalQr(invoice, 'LOJA:x|NP:0238|CR:Y|TIPO:DINE_IN|ID:z');

    const qrIdx = enriched.indexOf('────────────────');
    const footerIdx = enriched.indexOf('Gestor');
    expect(qrIdx).toBeGreaterThan(-1);
    expect(footerIdx).toBeGreaterThan(qrIdx); // QR antes do rodapé

    // Corte continua no final, depois do rodapé.
    const cutIdx = enriched.lastIndexOf('\x1d\x56');
    expect(cutIdx).toBeGreaterThan(footerIdx);
    expect(enriched.endsWith('\x1b\x40')).toBe(true);
  });
});

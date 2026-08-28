import { describe, expect, it } from 'vitest';

import { extractDisplayIdFromInvoice } from './strings.js';

describe('extractDisplayIdFromInvoice', () => {
  it('matches legacy PEDIDO label', () => {
    expect(extractDisplayIdFromInvoice('PEDIDO: #6798\nTotal')).toBe('6798');
  });

  it('matches Gestor Desktop v2 NÚMERO DO PEDIDO label', () => {
    expect(extractDisplayIdFromInvoice('NÚMERO DO PEDIDO: #3676817\nDATA: 28/08/2026')).toBe(
      '3676817',
    );
  });

  it('matches standalone shortReference before items section', () => {
    const invoice = [
      '        iFood',
      '    Restaurante Teste',
      '    ────────────────────────────────',
      '    3676817',
      '    ────────────────────────────────',
      '    ITENS:',
    ].join('\n');
    expect(extractDisplayIdFromInvoice(invoice)).toBe('3676817');
  });

  it('matches hash-only line', () => {
    expect(extractDisplayIdFromInvoice('Restaurante\n#1234\nITENS')).toBe('1234');
  });
});

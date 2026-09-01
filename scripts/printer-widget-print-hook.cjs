'use strict';

/**
 * DEPRECATED — see docs/adr/004-deprecated-approaches.md
 * Browser-only: Impressora GP iFood widget (localhost:4013). Not used by Gestor Desktop.
 * Hook para Impressora GP iFood (porta 4013) — enriquece EscPos antes de imprimir.
 */
const path = require('node:path');
const {
  enrichWithRetry,
  extractTextFromInvoice,
  getHealthPort,
} = require(path.join(
  process.env.IFOOD_QR_SCRIPTS_DIR ||
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'iFoodQrService', 'scripts'),
  'enrich-client.cjs',
));

function appendQrToEscPosArray(invoice, payload, pdfMode) {
  const out = [...invoice];
  if (pdfMode) {
    out.push({
      type: 'text',
      content: `\n--------------------------------\nQR:\n${payload}\n`,
      align: 'center',
    });
  } else {
    out.push({
      type: 'qrCode',
      content: payload,
      align: 'center',
      settings: { cellSize: 6, correction: 'M' },
    });
  }
  return out;
}

async function enrichPrintInvoice(invoice, printerName) {
  const lookupText = extractTextFromInvoice(invoice);
  if (!lookupText.trim()) {
    return invoice;
  }

  const detail = await enrichWithRetry(lookupText, printerName || '', {
    port: getHealthPort(),
  });

  if (!detail?.modified) {
    if (detail?.ok === false) {
      console.warn('[iFood QR] Servico indisponivel - comanda original (npm run dev?)');
    }
    return invoice;
  }

  console.log('[iFood QR] Impressao interceptada ->', printerName || 'padrao');
  console.log('[iFood QR] QR adicionado -', detail.payload || '');

  if (typeof invoice === 'string' && detail.invoice) {
    return detail.invoice;
  }

  if (Array.isArray(invoice) && detail.payload) {
    return appendQrToEscPosArray(invoice, detail.payload, !!detail.pdfMode);
  }

  return invoice;
}

module.exports = { enrichPrintInvoice, appendQrToEscPosArray };

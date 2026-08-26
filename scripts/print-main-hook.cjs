/**
 * Hook no processo principal do Electron (Gestor Desktop).
 * Intercepta ipcMain.on('printOrder') e enriquece a comanda via serviço local.
 *
 * Ativar no atalho do Gestor:
 *   --require="C:\...\scripts\print-main-hook.cjs"
 *
 * Requer npm run dev (ou serviço Windows) rodando na porta 7420.
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { ipcMain } = require('electron');

const HOOK_DIR = __dirname;
const ENRICH_CLI = path.join(HOOK_DIR, 'enrich-cli.js');
const HEALTH_PORT = process.env.IFOOD_QR_HEALTH_PORT || '7420';

function enrichSync(invoice, printerName) {
  const input = JSON.stringify({ invoice, printerName });
  const result = spawnSync(process.execPath, [ENRICH_CLI], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', IFOOD_QR_HEALTH_PORT: HEALTH_PORT },
    input,
    encoding: 'utf-8',
    timeout: 8000,
    windowsHide: true,
  });

  if (result.status === 0 && result.stdout) {
    try {
      return JSON.parse(result.stdout.trim());
    } catch {
      return null;
    }
  }

  if (result.stderr) {
    console.warn('[iFood QR] enrich-cli stderr:', result.stderr.slice(0, 200));
  }
  return null;
}

const originalOn = ipcMain.on.bind(ipcMain);

ipcMain.on = function patchedOn(channel, listener) {
  if (channel !== 'printOrder') {
    return originalOn(channel, listener);
  }

  console.log('[iFood QR] Interceptação de impressão ativa (printOrder → serviço :' + HEALTH_PORT + ')');

  return originalOn(channel, function wrappedPrintOrder(event, invoice, printerName, ...rest) {
    const printer = String(printerName || '');
    console.log('[iFood QR] Impressão interceptada →', printer || 'impressora padrão');

    const detail = enrichSync(String(invoice || ''), printer);
    const finalInvoice = detail?.modified && detail.invoice ? detail.invoice : invoice;

    if (detail?.modified) {
      console.log('[iFood QR] QR adicionado —', detail.payload || '');
      if (detail.previewPath) {
        console.log('[iFood QR] Preview:', detail.previewPath);
      }
    } else if (detail?.ok === false) {
      console.warn('[iFood QR] Serviço indisponível — imprimindo comanda original (rode npm run dev)');
    } else {
      console.warn('[iFood QR] Pedido não encontrado no cache — comanda sem QR');
    }

    return listener.call(this, event, finalInvoice, printerName, ...rest);
  });
};

console.log('[iFood QR] print-main-hook.cjs carregado');

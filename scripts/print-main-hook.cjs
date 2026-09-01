/**
 * DEPRECATED — see docs/adr/004-deprecated-approaches.md
 * Alternative ipcMain.on patch; prefer ipcHandler.js hook via setup-gestor-patch.ps1.
 * Hook no processo principal do Electron (Gestor Desktop).
 * Intercepta printOrder e enriquece a comanda via serviço local (HTTP).
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { ipcMain } = require('electron');
const { getHealthPort } = require('./enrich-client.cjs');

const HOOK_DIR = __dirname;
const ENRICH_CLI = path.join(HOOK_DIR, 'enrich-cli.cjs');
const HEALTH_PORT = getHealthPort();
const PRINT_CHANNEL = 'printOrder';

function enrichInvoice(invoice, printerName) {
  const input = JSON.stringify({ invoice, printerName, port: HEALTH_PORT });
  const result = spawnSync(process.execPath, [ENRICH_CLI], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', IFOOD_QR_HEALTH_PORT: String(HEALTH_PORT) },
    input,
    encoding: 'utf-8',
    timeout: 15000,
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

function processPrintArgs(invoice, printerName) {
  const printer = String(printerName || '');
  console.log('[iFood QR] Impressão interceptada →', printer || 'impressora padrão');

  const detail = enrichInvoice(invoice, printer);
  const finalInvoice = detail?.modified && detail.invoice ? detail.invoice : invoice;

  if (detail?.modified) {
    console.log('[iFood QR] QR adicionado —', detail.payload || '');
    if (detail.previewPath) {
      console.log('[iFood QR] Preview:', detail.previewPath);
    }
  } else if (detail?.ok === false) {
    console.warn(
      '[iFood QR] Serviço indisponível — imprimindo comanda original (rode npm run dev)',
    );
  } else {
    console.warn('[iFood QR] Pedido não encontrado no cache — comanda sem QR');
  }

  return finalInvoice;
}

function wrapListener(listener) {
  return function wrappedPrintOrder(event, invoice, printerName, ...rest) {
    const finalInvoice = processPrintArgs(invoice, printerName);
    return listener.call(this, event, finalInvoice, printerName, ...rest);
  };
}

function wrapHandler(handler) {
  return async function wrappedPrintHandler(event, invoice, printerName, ...rest) {
    const finalInvoice = processPrintArgs(invoice, printerName);
    return handler.call(this, event, finalInvoice, printerName, ...rest);
  };
}

function patchIpcMethod(methodName, wrapper) {
  const original = ipcMain[methodName].bind(ipcMain);

  ipcMain[methodName] = function patchedMethod(channel, listener) {
    if (channel !== PRINT_CHANNEL) {
      return original(channel, listener);
    }

    console.log(
      '[iFood QR] Interceptação ativa (' + methodName + ' → :' + HEALTH_PORT + ')',
    );
    return original(channel, wrapper(listener));
  };
}

patchIpcMethod('on', wrapListener);
patchIpcMethod('once', wrapListener);
patchIpcMethod('handle', wrapHandler);

console.log('[iFood QR] print-main-hook.cjs carregado (porta ' + HEALTH_PORT + ')');

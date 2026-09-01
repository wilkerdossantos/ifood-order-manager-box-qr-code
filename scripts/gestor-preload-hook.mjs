/**
 * Hook no preload do Gestor - intercepta ipcRenderer.send (string ou EscPos array).
 * Fallback: o hook principal vive em ipcHandler.js (main process).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ipcRenderer } from 'electron';

const PRINT_CHANNEL = 'printOrder';
const SCRIPTS_DIR =
  process.env.IFOOD_QR_SCRIPTS_DIR ||
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'iFoodQrService', 'scripts');
const ENRICH_CLI = path.join(SCRIPTS_DIR, 'enrich-cli.cjs');
const HEALTH_PORT = Number(process.env.IFOOD_QR_HEALTH_PORT || 7420);

function extractTextFromInvoice(invoice) {
  if (typeof invoice === 'string') return invoice;
  if (!Array.isArray(invoice)) return '';

  const parts = [];
  for (const item of invoice) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').toLowerCase();
    if (type === 'text') parts.push(String(item.content ?? item.payload ?? ''));
    if (type === 'leftright') {
      parts.push(String(item.left ?? item.content?.left ?? ''));
      parts.push(String(item.right ?? item.content?.right ?? ''));
    }
    if (type === 'customtable' && Array.isArray(item.content)) {
      for (const row of item.content) {
        if (row?.text) parts.push(String(row.text));
      }
    }
  }
  return parts.join('\n');
}

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

function enrichInvoice(invoice, printerName) {
  const lookupText = extractTextFromInvoice(invoice);
  const input = JSON.stringify({ invoice: lookupText, printerName: printerName || '', port: HEALTH_PORT });
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
  if (result.stderr) console.warn('[iFood QR] enrich-cli:', result.stderr.slice(0, 200));
  return null;
}

function patchIpcMethod(ipc, methodName) {
  if (ipc['__ifoodQrPatched_' + methodName]) return;
  const original = ipc[methodName].bind(ipc);
  ipc[methodName] = function patchedIpcChannel(channel, ...args) {
    if (channel === PRINT_CHANNEL && (typeof args[0] === 'string' || Array.isArray(args[0]))) {
      console.log('[iFood QR] Impressao interceptada ->', args[1] || 'padrao');
      const detail = enrichInvoice(args[0], args[1]);
      let finalInvoice = args[0];
      if (detail?.modified) {
        if (typeof args[0] === 'string' && detail.invoice) {
          finalInvoice = detail.invoice;
        } else if (Array.isArray(args[0]) && detail.payload) {
          finalInvoice = appendQrToEscPosArray(args[0], detail.payload, !!detail.pdfMode);
        }
        console.log('[iFood QR] QR adicionado -', detail.payload || '');
      } else if (detail?.ok === false) {
        console.warn('[iFood QR] Servico indisponivel (npm run dev?)');
      }
      return original(channel, finalInvoice, ...args.slice(1));
    }
    return original(channel, ...args);
  };
  ipc['__ifoodQrPatched_' + methodName] = true;
}

patchIpcMethod(ipcRenderer, 'send');
patchIpcMethod(ipcRenderer, 'sendSync');
console.log('[iFood QR] preload hook ativo (porta ' + HEALTH_PORT + ')');

/**
 * Hook no main process — enriquece string ou array EscPos antes de imprimir.
 * Usa HTTP direto (sem spawnSync) para funcionar dentro do Electron main.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const SCRIPTS_DIR =
  process.env.IFOOD_QR_SCRIPTS_DIR ||
  path.join(process.env.ProgramData || "C:\\ProgramData", "iFoodQrService", "scripts");
const LOG_FILE = path.join(
  process.env.ProgramData || "C:\\ProgramData",
  "iFoodQrService",
  "logs",
  "print-hook.log",
);
const require = createRequire(import.meta.url);
const { enrichWithRetry, extractTextFromInvoice: extractFromClient } = require(
  path.join(SCRIPTS_DIR, "enrich-client.cjs"),
);

function logHook(line) {
  const msg = `${new Date().toISOString()} ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, msg);
  } catch {
    // ignore
  }
  console.log(line);
}

function extractTextFromInvoice(invoice) {
  const direct = extractFromClient(invoice);
  if (direct.trim()) return direct;

  // Fallback: busca padrões no JSON serializado (customTable / estruturas atípicas)
  try {
    const raw = typeof invoice === "string" ? invoice : JSON.stringify(invoice);
    const numero = raw.match(/N[UÚ]MERO\s+DO\s+PEDIDO\s*:?\s*#?\s*([0-9]{3,8})/i)?.[1];
    if (numero) return raw;
    return raw;
  } catch {
    return "";
  }
}

function appendQrToEscPosArray(invoice, payload, pdfMode) {
  const out = [...invoice];
  if (pdfMode) {
    out.push({
      type: "text",
      content: `\n--------------------------------\nQR:\n${payload}\n`,
      align: "center",
    });
  } else {
    out.push({
      type: "qrCode",
      content: payload,
      align: "center",
      settings: { cellSize: 6, correction: "M" },
    });
  }
  return out;
}

export async function enrichPrintInvoiceAsync(invoice, printerName) {
  const kind = Array.isArray(invoice) ? `array:${invoice.length}` : typeof invoice;
  logHook(`[iFood QR] print recebido kind=${kind} printer=${printerName || "?"}`);

  const lookupText = extractTextFromInvoice(invoice);
  if (!lookupText.trim()) {
    logHook("[iFood QR] AVISO: comanda sem texto extraivel");
    return invoice;
  }

  const detail = await enrichWithRetry(lookupText, printerName || "");
  if (!detail?.modified) {
    const preview = lookupText.slice(0, 100).replace(/\s+/g, " ");
    if (detail?.ok === false) {
      logHook("[iFood QR] Servico indisponivel (npm run dev?)");
    } else {
      logHook(`[iFood QR] Pedido nao no cache — ${preview}`);
    }
    return invoice;
  }

  logHook(`[iFood QR] QR adicionado -> ${detail.payload || ""}`);

  if (typeof invoice === "string" && detail.invoice) {
    return detail.invoice;
  }

  if (Array.isArray(invoice) && detail.payload) {
    return appendQrToEscPosArray(invoice, detail.payload, !!detail.pdfMode);
  }

  return invoice;
}

/** @deprecated use enrichPrintInvoiceAsync — mantido para compatibilidade */
export function enrichPrintInvoice(invoice, printerName) {
  logHook("[iFood QR] AVISO: enrichPrintInvoice sync chamado — use async");
  return invoice;
}

export async function installThermalPrinterHook(iFoodThermalPrinter) {
  if (iFoodThermalPrinter.__ifoodQrPatched) return;
  const origPrint = iFoodThermalPrinter.print.bind(iFoodThermalPrinter);
  iFoodThermalPrinter.print = async (content, config) => {
    const enriched = await enrichPrintInvoiceAsync(content, config?.printer);
    return origPrint(enriched, config);
  };
  iFoodThermalPrinter.__ifoodQrPatched = true;
  logHook("[iFood QR] thermal-printer.print patched");
}

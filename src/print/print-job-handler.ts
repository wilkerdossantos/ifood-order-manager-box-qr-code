import fs from 'node:fs';

import type { ServiceConfig } from '../config/types.js';
import type { InvoiceEnricher } from '../qr/invoice-enricher.js';
import { stripEscPosToText } from '../qr/escpos.js';
import { extractDisplayIdFromInvoice } from '../utils/strings.js';
import { isPdfPrinterName } from '../utils/printer.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { OrderCache } from '../collector/order-cache.js';
import type { PrintDebugWriter } from './print-debug-writer.js';
import { forwardToPrinter } from './raw-forwarder.js';

export interface PrintJobHandlerResult {
  displayId: string;
  modified: boolean;
  forwarded: boolean;
  debugFiles: Record<string, string> | null;
}

export class PrintJobHandler {
  constructor(
    private config: ServiceConfig,
    private cache: OrderCache,
    private enricher: InvoiceEnricher,
    private debugWriter: PrintDebugWriter,
    private logger: Logger,
    private activity: ActivityLog,
  ) {}

  async handleRawInvoice(
    invoice: string,
    source: 'spool' | 'queue',
    extra?: Record<string, unknown>,
  ): Promise<PrintJobHandlerResult> {
    const readable = stripEscPosToText(invoice);
    const displayId =
      extractDisplayIdFromInvoice(readable) || extractDisplayIdFromInvoice(invoice);

    const target = this.config.targetPrinterName;
    const usePdfMode = isPdfPrinterName(target);

    this.logger.info(`[${source.toUpperCase()}] Job de impressao detectado`, {
      bytes: Buffer.byteLength(invoice, 'latin1'),
      displayId: displayId || 'N/A',
      cacheOrders: this.cache.getStats().uniqueOrders,
      targetPrinter: target || '(nao configurado)',
      pdfMode: usePdfMode,
    });

    const detail = await this.enricher.enrichInvoiceDetailed(invoice, {
      printerName: target || this.config.printerName,
      pdfMode: usePdfMode,
      savePreview: true,
    });

    const debugEntry = this.debugWriter.saveJob(source, invoice, detail, {
      displayIdFromReadable: displayId,
      readableLength: readable.length,
      cacheStats: this.cache.getStats(),
      targetPrinter: target,
      ...extra,
    });

    const debugFiles = debugEntry
      ? {
          readable: debugEntry.readablePath,
          enriched: debugEntry.enrichedPath,
          raw: debugEntry.rawPath,
          meta: debugEntry.metaPath,
        }
      : null;

    if (detail.modified && detail.order) {
      this.activity.printEnriched(detail.order.displayId, detail.payload || '');
      this.logger.info(`[${source.toUpperCase()}] QR adicionado a comanda`, {
        pedido: detail.order.displayId,
        pdfMode: detail.pdfMode,
        debug: debugEntry?.readablePath,
      });
    } else {
      this.logger.warn(`[${source.toUpperCase()}] Comanda NAO modificada`, {
        displayIdExtraido: displayId || 'N/A',
        pedidosNoCache: this.cache.getStats().uniqueOrders,
        dica: 'Veja *-readable.txt em print-debug. Confirme CDP capturando pedidos.',
        debug: debugEntry?.readablePath,
      });
    }

    let forwarded = false;
    if (target) {
      const payload = usePdfMode ? stripEscPosToText(detail.invoice) : detail.invoice;
      forwarded = forwardToPrinter(payload, target, this.logger, { textMode: usePdfMode });
    } else {
      this.logger.warn(`[${source.toUpperCase()}] Configure targetPrinterName em config.json`);
    }

    return {
      displayId: displayId || '',
      modified: detail.modified,
      forwarded,
      debugFiles,
    };
  }

  readInvoiceFromFile(filePath: string): string {
    const raw = fs.readFileSync(filePath);
    return Buffer.from(raw).toString('latin1');
  }
}

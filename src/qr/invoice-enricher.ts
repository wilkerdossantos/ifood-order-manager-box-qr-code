import type { OrderData, PrintMeta, ServiceConfig } from '../config/types.js';
import { injectPdfQrText, injectThermalQr } from '../qr/escpos.js';
import { generateQrPayload } from '../qr/payload.js';
import type { OrderCache } from '../collector/order-cache.js';

export interface EnrichOptions {
  pdfMode?: boolean;
  printerName?: string;
  printMeta?: PrintMeta;
}

export class InvoiceEnricher {
  constructor(
    private cache: OrderCache,
    private config: ServiceConfig,
  ) {}

  async enrichInvoice(invoice: string, options: EnrichOptions = {}): Promise<string> {
    if (!this.config.enabled) return invoice;

    const data = await this.cache.resolveOrderForPrint(invoice, options.printMeta || {});
    if (!data) return invoice;

    const payload = generateQrPayload(data);
    const pdfSafe = this.shouldUsePdfSafeMode(options);

    if (pdfSafe) {
      return injectPdfQrText(invoice, payload);
    }
    return injectThermalQr(invoice, payload);
  }

  async enrichPrintBody(body: string): Promise<string> {
    if (!body || typeof body !== 'string') return body;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      this.cache.ingestPayload(parsed);
      this.cache.ingestPrintPackage(parsed);

      if (!parsed.invoice || typeof parsed.invoice !== 'string') return body;

      const printMeta: PrintMeta & { _parsed?: Record<string, unknown> } = {
        orderId: String(
          parsed.orderId ||
            (parsed.order as Record<string, unknown>)?.id ||
            (parsed.order as Record<string, unknown>)?.orderId ||
            '',
        ),
        merchantId: String(
          parsed.merchantId ||
            parsed.storeId ||
            (parsed.merchant as Record<string, unknown>)?.id ||
            (parsed.order as Record<string, unknown>)?.merchantId ||
            '',
        ),
        _parsed: parsed,
      };

      const printerConfig = (parsed.printerConfig || {}) as Record<string, unknown>;
      const modified = await this.enrichInvoice(String(parsed.invoice), {
        printMeta,
        printerName: String(printerConfig.printer || ''),
        pdfMode: this.config.pdfMode,
      });

      if (modified !== parsed.invoice) {
        parsed.invoice = modified;
        return JSON.stringify(parsed);
      }
    } catch {
      // return original on parse failure
    }
    return body;
  }

  resolvePayloadForInvoice(invoice: string): Promise<OrderData | null> {
    return this.cache.resolveOrderForPrint(invoice);
  }

  private shouldUsePdfSafeMode(options: EnrichOptions): boolean {
    if (this.config.pdfMode || options.pdfMode) return true;
    const printer = String(options.printerName || '').toUpperCase();
    return printer === 'PDF' || printer.includes('PDF');
  }
}

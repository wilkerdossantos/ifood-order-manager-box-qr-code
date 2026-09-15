import type { OrderData, PrintMeta, ServiceConfig } from '../config/types.js';
import { injectPdfQrText, injectThermalQr } from '../qr/escpos.js';
import { generateQrPayload } from '../qr/payload.js';
import { generateMockOrder, mockQrHeader } from '../qr/mock.js';
import type { OrderCache } from '../collector/order-cache.js';
import type { PrintPreviewWriter } from '../print/preview-writer.js';

export interface EnrichOptions {
  pdfMode?: boolean;
  printerName?: string;
  printMeta?: PrintMeta;
  savePreview?: boolean;
}

export interface EnrichResult {
  invoice: string;
  modified: boolean;
  pdfMode: boolean;
  payload?: string;
  order?: OrderData;
  previewPath?: string | null;
}

export class InvoiceEnricher {
  constructor(
    private cache: OrderCache,
    private config: ServiceConfig,
    private previewWriter?: PrintPreviewWriter,
  ) {}

  async enrichInvoice(invoice: string, options: EnrichOptions = {}): Promise<string> {
    const result = await this.enrichInvoiceDetailed(invoice, options);
    return result.invoice;
  }

  async enrichInvoiceDetailed(invoice: string, options: EnrichOptions = {}): Promise<EnrichResult> {
    if (!this.config.enabled) {
      return { invoice, modified: false, pdfMode: false };
    }

    const data = await this.cache.resolveOrderForPrint(invoice, options.printMeta || {});
    if (!data) {
      return { invoice, modified: false, pdfMode: this.shouldUsePdfSafeMode(options) };
    }

    // Modo mock (apresentação): sobrescreve os dados reais por um pedido mock
    // com displayId/pickupCode aleatórios, para gerar códigos de abertura de
    // box diferentes a cada reimpressão.
    const orderData = this.config.mockMode ? generateMockOrder() : data;

    const payload = generateQrPayload(orderData);
    const pdfMode = this.shouldUsePdfSafeMode(options);

    // Modo mock: imprime Número do Pedido e Código de Retirada acima do QR,
    // para leitura manual sem escanear. Não altera o texto original da comanda.
    const header = this.config.mockMode ? mockQrHeader(orderData) : undefined;

    const enriched = pdfMode
      ? injectPdfQrText(invoice, payload, header)
      : injectThermalQr(invoice, payload, header);

    const modified = enriched !== invoice;
    let previewPath: string | null = null;

    if (modified && options.savePreview !== false && this.previewWriter) {
      previewPath = this.previewWriter.save({
        invoice: enriched,
        payload,
        pdfMode,
        printerName: options.printerName,
        displayId: orderData.displayId,
      });
    }

    return {
      invoice: enriched,
      modified,
      pdfMode,
      payload,
      order: orderData,
      previewPath,
    };
  }

  async enrichPrintBody(body: string): Promise<string> {
    if (!body || typeof body !== 'string') return body;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      this.cache.ingestPayload(parsed);
      this.cache.ingestPrintPackage(parsed);

      const rawInvoice = parsed.invoice;
      if (rawInvoice == null) return body;

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
      const printerName = String(printerConfig.printer || '');

      if (typeof rawInvoice === 'string') {
        const detail = await this.enrichInvoiceDetailed(String(rawInvoice), {
          printMeta,
          printerName,
          pdfMode: this.config.pdfMode,
        });
        if (detail.modified) {
          parsed.invoice = detail.invoice;
          return JSON.stringify(parsed);
        }
        return body;
      }

      if (Array.isArray(rawInvoice)) {
        const lookupText = rawInvoice
          .filter((item) => item && typeof item === 'object')
          .map((item) => {
            const row = item as Record<string, unknown>;
            const type = String(row.type || '').toLowerCase();
            if (type === 'text') return String(row.content ?? row.payload ?? '');
            if (type === 'leftright') {
              return `${String(row.left ?? '')} ${String(row.right ?? '')}`;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');

        const detail = await this.enrichInvoiceDetailed(lookupText, {
          printMeta,
          printerName,
          pdfMode: this.config.pdfMode,
        });

        if (detail.modified && detail.payload) {
          const out = [...rawInvoice] as Record<string, unknown>[];
          // Modo mock: imprime Número do Pedido e Código de Retirada acima do QR.
          const header = this.config.mockMode && detail.order ? mockQrHeader(detail.order) : '';
          if (detail.pdfMode) {
            out.push({
              type: 'text',
              content: `\n--------------------------------\n${header}QR:\n${detail.payload}\n`,
              align: 'center',
            });
          } else {
            if (header) {
              out.push({ type: 'text', content: `\n${header}\n`, align: 'center' });
            }
            out.push({
              type: 'qrCode',
              content: detail.payload,
              align: 'center',
              settings: { cellSize: 6, correction: 'M' },
            });
          }
          parsed.invoice = out;
          return JSON.stringify(parsed);
        }
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

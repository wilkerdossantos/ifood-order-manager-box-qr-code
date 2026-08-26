import net from 'node:net';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { InvoiceEnricher } from '../qr/invoice-enricher.js';

function guardSocket(socket: net.Socket, logger: Logger, label: string): void {
  socket.on('error', (err: NodeJS.ErrnoException) => {
    const benign = err.code === 'ECONNRESET' || err.code === 'EPIPE';
    if (!benign) {
      logger.debug('[PRINT BRIDGE] Erro de socket', { label, code: err.code, error: err.message });
    }
  });
}

export interface PrintBridgeRequest {
  action: 'enrich' | 'health';
  invoice?: string;
  printerName?: string;
  pdfMode?: boolean;
  printMeta?: Record<string, unknown>;
}

export interface PrintBridgeResponse {
  ok: boolean;
  invoice?: string;
  payload?: string;
  modified?: boolean;
  pdfMode?: boolean;
  previewPath?: string | null;
  error?: string;
}

export class PrintBridgeServer {
  private server: net.Server | null = null;
  private pipePath: string;

  constructor(
    private config: ServiceConfig,
    private enricher: InvoiceEnricher,
    private logger: Logger,
    private activity: ActivityLog,
  ) {
    this.pipePath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${config.pipeName}`
        : `/tmp/${config.pipeName}.sock`;
  }

  getPipePath(): string {
    return this.pipePath;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        guardSocket(socket, this.logger, 'print-bridge');
        let buffer = '';
        socket.on('data', async (chunk) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const response = await this.handleRequest(line);
            socket.write(`${JSON.stringify(response)}\n`);
          }
        });
      });

      this.server.listen(this.pipePath, () => {
        this.logger.info('Print bridge listening', { pipe: this.pipePath });
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  async handleRequest(raw: string): Promise<PrintBridgeResponse> {
    try {
      const req = JSON.parse(raw) as PrintBridgeRequest;

      if (req.action === 'health') {
        return { ok: true };
      }

      if (req.action === 'enrich' && req.invoice) {
        this.logger.info('[PRINT BRIDGE] Requisição de enriquecimento recebida');
        const detail = await this.enricher.enrichInvoiceDetailed(req.invoice, {
          printerName: req.printerName,
          pdfMode: req.pdfMode,
          printMeta: req.printMeta,
        });
        if (detail.modified && detail.order) {
          this.activity.printEnriched(detail.order.displayId, detail.payload || '');
        } else if (!detail.modified) {
          this.logger.warn('[PRINT BRIDGE] Comanda não modificada — pedido não encontrado no cache', {
            dica: 'Verifique se o CDP capturou o pedido antes de imprimir',
          });
        }
        return {
          ok: true,
          invoice: detail.invoice,
          modified: detail.modified,
          pdfMode: detail.pdfMode,
          payload: detail.payload,
          previewPath: detail.previewPath,
        };
      }

      return { ok: false, error: 'Invalid request' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}

/** Client helper for print bridge integrations (e.g. virtual printer driver). */
export class PrintBridgeClient {
  constructor(private pipePath: string) {}

  async enrich(invoice: string, options: Partial<PrintBridgeRequest> = {}): Promise<PrintBridgeResponse> {
    return new Promise((resolve, reject) => {
      const client = net.connect(this.pipePath, () => {
        client.write(
          `${JSON.stringify({ action: 'enrich', invoice, ...options })}\n`,
        );
      });

      let data = '';
      client.on('data', (chunk) => {
        data += chunk.toString('utf-8');
        const line = data.split('\n')[0];
        if (line) {
          try {
            resolve(JSON.parse(line) as PrintBridgeResponse);
            client.end();
          } catch (err) {
            reject(err);
          }
        }
      });

      client.on('error', reject);
      setTimeout(() => {
        client.destroy();
        reject(new Error('Print bridge timeout'));
      }, 5000);
    });
  }
}

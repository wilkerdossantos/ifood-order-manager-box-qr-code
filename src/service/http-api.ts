import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { OrderCache } from '../collector/order-cache.js';
import type { InvoiceEnricher } from '../qr/invoice-enricher.js';

interface HttpApiOptions {
  config: ServiceConfig;
  cache: OrderCache;
  enricher: InvoiceEnricher;
  logger: Logger;
  activity: ActivityLog;
  getProxyCaPath: () => string;
  getDiagnostics: () => Record<string, unknown>;
}

export class HttpApi {
  private server: http.Server | null = null;

  constructor(private options: HttpApiOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handle(req, res).catch((err) => {
          this.options.logger.error('HTTP API error', { error: err });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Internal error' }));
        });
      });

      this.server.listen(this.options.config.healthPort, '127.0.0.1', () => {
        this.options.logger.info('HTTP API listening', {
          port: this.options.config.healthPort,
        });
        resolve();
      });

      this.server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Porta ${this.options.config.healthPort} já em uso. ` +
                'Outra instância do serviço está rodando. Execute: .\\scripts\\stop-dev.ps1',
            ),
          );
          return;
        }
        reject(err);
      });
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

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.options.config.healthPort}`);
    const method = req.method || 'GET';

    this.options.logger.debug('[API] request', { method, path: url.pathname });

    if (method === 'GET' && url.pathname === '/health') {
      return this.json(res, 200, {
        ok: true,
        enabled: this.options.config.enabled,
        version: '1.0.0',
      });
    }

    if (method === 'GET' && url.pathname === '/cache/stats') {
      return this.json(res, 200, this.options.cache.getStats());
    }

    if (method === 'GET' && url.pathname.startsWith('/orders/')) {
      const displayId = decodeURIComponent(url.pathname.replace('/orders/', ''));
      const order = this.options.cache.getOrder(displayId);
      return this.json(res, order ? 200 : 404, order || { error: 'Not found' });
    }

    if (method === 'GET' && url.pathname === '/orders') {
      return this.json(res, 200, { orders: this.options.cache.getAllOrders() });
    }

    if (method === 'GET' && url.pathname === '/print/debug') {
      const debugDir =
        this.options.config.printDebugDir ||
        path.join(this.options.config.spoolDir, 'debug');
      return this.json(res, 200, {
        enabled: this.options.config.printDebugEnabled,
        debugDir,
        dica: 'Abra *-readable.txt e *-enriched.txt apos cada impressao',
        cache: this.options.cache.getStats(),
        orders: this.options.cache.getAllOrders(),
      });
    }

    if (method === 'GET' && url.pathname === '/diagnostics') {
      return this.json(res, 200, {
        cache: this.options.cache.getStats(),
        orders: this.options.cache.getAllOrders(),
        ...this.options.getDiagnostics(),
      });
    }

    if (method === 'GET' && url.pathname === '/config/ca-cert') {
      const caPath = this.options.getProxyCaPath();
      res.writeHead(200, { 'Content-Type': 'application/x-pem-file' });
      const fs = await import('node:fs');
      if (fs.existsSync(caPath)) {
        res.end(fs.readFileSync(caPath));
      } else {
        res.end('');
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/ingest') {
      const body = await this.readBody(req);
      try {
        const parsed = JSON.parse(body);
        const captured = this.options.cache.ingestPayload(parsed);
        if (captured.length > 0) {
          this.options.activity.ordersIngested(captured, 'api', '/ingest');
        }
        return this.json(res, 200, { ok: true, captured: captured.length });
      } catch {
        return this.json(res, 400, { ok: false, error: 'Invalid JSON' });
      }
    }

    if (method === 'POST' && url.pathname === '/print/enrich') {
      const body = await this.readBody(req);
      try {
        const parsed = JSON.parse(body) as { invoice?: string; printerName?: string };
        if (!parsed.invoice) {
          return this.json(res, 400, { ok: false, error: 'invoice required' });
        }
        const detail = await this.options.enricher.enrichInvoiceDetailed(parsed.invoice, {
          printerName: parsed.printerName,
        });
        if (detail.modified && detail.order) {
          this.options.activity.printEnriched(detail.order.displayId, detail.payload || '');
        }
        return this.json(res, 200, {
          ok: true,
          invoice: detail.invoice,
          modified: detail.modified,
          pdfMode: detail.pdfMode,
          payload: detail.payload,
          previewPath: detail.previewPath,
        });
      } catch {
        return this.json(res, 400, { ok: false, error: 'Invalid JSON' });
      }
    }

    if (method === 'POST' && url.pathname === '/print') {
      const body = await this.readBody(req);
      const enriched = await this.options.enricher.enrichPrintBody(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(enriched);
      return;
    }

    this.json(res, 404, { ok: false, error: 'Not found' });
  }

  private json(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}

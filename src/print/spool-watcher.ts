import fs from 'node:fs';
import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { InvoiceEnricher } from '../qr/invoice-enricher.js';
import type { OrderCache } from '../collector/order-cache.js';
import { stripEscPosToText } from '../qr/escpos.js';
import { extractDisplayIdFromInvoice } from '../utils/strings.js';
import { forwardRawToPrinter } from './raw-forwarder.js';
import type { PrintDebugWriter } from './print-debug-writer.js';

export interface SpoolWatcherDiagnostics {
  spoolDir: string;
  spoolFile: string;
  debugDir: string;
  enabled: boolean;
  jobsProcessed: number;
  lastJobAt: string | null;
  lastError: string | null;
  lastDebugFiles: Record<string, string> | null;
}

export class SpoolWatcher {
  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private queue: string[] = [];
  private jobsProcessed = 0;
  private lastJobAt: string | null = null;
  private lastError: string | null = null;
  private lastDebugFiles: Record<string, string> | null = null;
  private lastProcessedSize = 0;

  constructor(
    private config: ServiceConfig,
    private cache: OrderCache,
    private enricher: InvoiceEnricher,
    private debugWriter: PrintDebugWriter,
    private logger: Logger,
    private activity: ActivityLog,
  ) {}

  getSpoolFile(): string {
    return path.join(this.config.spoolDir, 'output.prn');
  }

  getDiagnostics(): SpoolWatcherDiagnostics {
    return {
      spoolDir: this.config.spoolDir,
      spoolFile: this.getSpoolFile(),
      debugDir: this.debugWriter.getDebugDir(),
      enabled: this.config.spoolWatchEnabled,
      jobsProcessed: this.jobsProcessed,
      lastJobAt: this.lastJobAt,
      lastError: this.lastError,
      lastDebugFiles: this.lastDebugFiles,
    };
  }

  start(): void {
    if (!this.config.spoolWatchEnabled || process.platform !== 'win32') {
      return;
    }

    const spoolDir = this.config.spoolDir;
    const spoolFile = this.getSpoolFile();

    fs.mkdirSync(spoolDir, { recursive: true });
    fs.mkdirSync(this.debugWriter.getDebugDir(), { recursive: true });
    if (!fs.existsSync(spoolFile)) {
      fs.writeFileSync(spoolFile, '');
    }

    this.watcher = chokidar.watch([spoolFile, spoolDir], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 200 },
      depth: 0,
      ignored: (p) => p.includes(`${path.sep}debug${path.sep}`),
    });

    const enqueue = (filePath: string) => {
      if (!filePath.endsWith('.prn')) return;
      if (filePath.includes(`${path.sep}debug${path.sep}`)) return;
      if (this.queue.includes(filePath)) return;
      this.queue.push(filePath);
      void this.drainQueue();
    };

    this.watcher.on('add', enqueue);
    this.watcher.on('change', enqueue);

    this.watcher.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug('[SPOOL] watcher error', { error: msg });
    });

    // Fallback: poll a cada 2s (chokidar as vezes nao dispara no Windows)
    this.pollTimer = setInterval(() => {
      try {
        const stat = fs.statSync(spoolFile);
        if (stat.size > 0 && stat.size !== this.lastProcessedSize && !this.queue.includes(spoolFile)) {
          this.logger.debug('[SPOOL] Job detectado via poll', { bytes: stat.size });
          enqueue(spoolFile);
        }
      } catch {
        // ignore
      }
    }, 2000);

    this.logger.info('[SPOOL] Watcher ativo', {
      spoolFile,
      debugDir: this.debugWriter.getDebugDir(),
      targetPrinter: this.config.targetPrinterName || '(nao configurado)',
      virtualPrinter: this.config.printerName,
      printDebug: this.config.printDebugEnabled,
    });
  }

  stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    return this.watcher?.close() ?? Promise.resolve();
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const filePath = this.queue.shift()!;
        await this.processSpoolFile(filePath);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processSpoolFile(filePath: string): Promise<void> {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0) return;

      this.lastProcessedSize = stat.size;

      const raw = fs.readFileSync(filePath);
      const invoice = Buffer.from(raw).toString('latin1');
      const readable = stripEscPosToText(invoice);
      const displayId = extractDisplayIdFromInvoice(readable) || extractDisplayIdFromInvoice(invoice);

      this.logger.info('[SPOOL] Job de impressao detectado', {
        file: filePath,
        bytes: stat.size,
        displayId: displayId || 'N/A',
        cacheOrders: this.cache.getStats().uniqueOrders,
      });

      const target = this.config.targetPrinterName;
      const detail = await this.enricher.enrichInvoiceDetailed(invoice, {
        printerName: target || this.config.printerName,
        savePreview: true,
      });

      const debugEntry = this.debugWriter.saveJob('spool', invoice, detail, {
        displayIdFromReadable: displayId,
        readableLength: readable.length,
        cacheStats: this.cache.getStats(),
        targetPrinter: target,
      });

      if (debugEntry) {
        this.lastDebugFiles = {
          readable: debugEntry.readablePath,
          enriched: debugEntry.enrichedPath,
          raw: debugEntry.rawPath,
          meta: debugEntry.metaPath,
        };
      }

      if (detail.modified && detail.order) {
        this.activity.printEnriched(detail.order.displayId, detail.payload || '');
        this.logger.info('[SPOOL] QR adicionado a comanda', {
          pedido: detail.order.displayId,
          pdfMode: detail.pdfMode,
          debug: debugEntry?.readablePath,
        });
      } else {
        this.logger.warn('[SPOOL] Comanda NAO modificada', {
          displayIdExtraido: displayId || 'N/A',
          pedidosNoCache: this.cache.getStats().uniqueOrders,
          dica: 'Veja o txt em print-debug. Confirme CDP capturando pedidos.',
          debug: debugEntry?.readablePath,
        });
      }

      if (target) {
        const ok = forwardRawToPrinter(detail.invoice, target, this.logger);
        if (!ok) {
          this.lastError = `Falha ao encaminhar para ${target}`;
        }
      } else {
        this.lastError = 'targetPrinterName nao configurado';
        this.logger.warn('[SPOOL] Configure targetPrinterName em config.json');
      }

      this.jobsProcessed += 1;
      this.lastJobAt = new Date().toISOString();
      if (target && !this.lastError) {
        this.lastError = null;
      }

      try {
        fs.truncateSync(filePath, 0);
        this.lastProcessedSize = 0;
      } catch {
        try {
          fs.unlinkSync(filePath);
          fs.writeFileSync(filePath, '');
          this.lastProcessedSize = 0;
        } catch {
          // ignore
        }
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error('[SPOOL] Erro ao processar job', { error: this.lastError, file: filePath });
    }
  }
}

import fs from 'node:fs';
import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { InvoiceEnricher } from '../qr/invoice-enricher.js';
import { forwardRawToPrinter } from './raw-forwarder.js';

export interface SpoolWatcherDiagnostics {
  spoolDir: string;
  spoolFile: string;
  enabled: boolean;
  jobsProcessed: number;
  lastJobAt: string | null;
  lastError: string | null;
}

export class SpoolWatcher {
  private watcher: FSWatcher | null = null;
  private processing = false;
  private queue: string[] = [];
  private jobsProcessed = 0;
  private lastJobAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private config: ServiceConfig,
    private enricher: InvoiceEnricher,
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
      enabled: this.config.spoolWatchEnabled,
      jobsProcessed: this.jobsProcessed,
      lastJobAt: this.lastJobAt,
      lastError: this.lastError,
    };
  }

  start(): void {
    if (!this.config.spoolWatchEnabled || process.platform !== 'win32') {
      return;
    }

    const spoolDir = this.config.spoolDir;
    const spoolFile = this.getSpoolFile();

    fs.mkdirSync(spoolDir, { recursive: true });
    if (!fs.existsSync(spoolFile)) {
      fs.writeFileSync(spoolFile, '');
    }

    this.watcher = chokidar.watch([spoolFile, spoolDir], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 200 },
      depth: 0,
    });

    const enqueue = (filePath: string) => {
      if (!filePath.endsWith('.prn')) return;
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

    this.logger.info('[SPOOL] Watcher ativo (substituto RedMon para Windows 11)', {
      spoolFile,
      targetPrinter: this.config.targetPrinterName || '(nao configurado)',
      virtualPrinter: this.config.printerName,
    });
  }

  stop(): Promise<void> {
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

      this.logger.info('[SPOOL] Job de impressao detectado', {
        file: filePath,
        bytes: stat.size,
      });

      const raw = fs.readFileSync(filePath);
      const invoice = Buffer.from(raw).toString('latin1');

      const target = this.config.targetPrinterName;
      const detail = await this.enricher.enrichInvoiceDetailed(invoice, {
        printerName: target || this.config.printerName,
      });

      if (detail.modified && detail.order) {
        this.activity.printEnriched(detail.order.displayId, detail.payload || '');
        this.logger.info('[SPOOL] QR adicionado a comanda', {
          pedido: detail.order.displayId,
          pdfMode: detail.pdfMode,
          preview: detail.previewPath,
        });
      } else {
        this.logger.warn('[SPOOL] Comanda nao modificada - pedido fora do cache?', {
          dica: 'Confirme CDP capturando pedidos antes de imprimir',
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
      this.lastError = null;

      try {
        fs.truncateSync(filePath, 0);
      } catch {
        try {
          fs.unlinkSync(filePath);
          fs.writeFileSync(filePath, '');
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

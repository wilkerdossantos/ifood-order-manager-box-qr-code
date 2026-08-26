import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { PrintJobHandler } from './print-job-handler.js';
import { resolveScriptsDir } from './raw-forwarder.js';

interface PrintJobInfo {
  Id: number;
  DocumentName?: string;
  JobStatus?: string;
  Size?: number;
  SubmittedTime?: string;
}

export interface QueueWatcherDiagnostics {
  enabled: boolean;
  printerName: string;
  jobsProcessed: number;
  lastJobAt: string | null;
  lastError: string | null;
  lastDebugFiles: Record<string, string> | null;
  seenJobIds: number;
}

export class PrintQueueWatcher {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private seenJobIds = new Set<number>();
  private jobsProcessed = 0;
  private lastJobAt: string | null = null;
  private lastError: string | null = null;
  private lastDebugFiles: Record<string, string> | null = null;

  constructor(
    private config: ServiceConfig,
    private handler: PrintJobHandler,
    private logger: Logger,
  ) {}

  getDiagnostics(): QueueWatcherDiagnostics {
    return {
      enabled: this.config.printQueueWatchEnabled,
      printerName: this.config.printerName,
      jobsProcessed: this.jobsProcessed,
      lastJobAt: this.lastJobAt,
      lastError: this.lastError,
      lastDebugFiles: this.lastDebugFiles,
      seenJobIds: this.seenJobIds.size,
    };
  }

  start(): void {
    if (!this.config.printQueueWatchEnabled || process.platform !== 'win32') {
      return;
    }

    const scriptsDir = resolveScriptsDir();
    const listScript = path.join(scriptsDir, 'get-print-jobs.ps1');
    const captureScript = path.join(scriptsDir, 'capture-print-job.ps1');

    if (!fs.existsSync(listScript) || !fs.existsSync(captureScript)) {
      this.logger.warn('[QUEUE] Scripts de fila nao encontrados', { scriptsDir });
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.pollJobs();
    }, 1500);

    this.logger.info('[QUEUE] Watcher de fila ativo', {
      printer: this.config.printerName,
      targetPrinter: this.config.targetPrinterName || '(nao configurado)',
      dica: 'Funciona com PORTPROMPT + Microsoft Print to PDF (sem porta arquivo)',
      adminRequired: 'Execute npm run dev como Administrador para ler spool do Windows',
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollJobs(): Promise<void> {
    if (this.processing) return;

    const jobs = this.listJobs();
    for (const job of jobs) {
      if (this.seenJobIds.has(job.Id)) continue;
      this.seenJobIds.add(job.Id);
      await this.processJob(job);
    }
  }

  private listJobs(): PrintJobInfo[] {
    const scriptsDir = resolveScriptsDir();
    const listScript = path.join(scriptsDir, 'get-print-jobs.ps1');

    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', listScript, '-PrinterName', this.config.printerName],
      { encoding: 'utf-8', timeout: 15000, windowsHide: true },
    );

    if (result.status !== 0 || !result.stdout?.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(result.stdout.trim()) as PrintJobInfo | PrintJobInfo[];
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  private async processJob(job: PrintJobInfo): Promise<void> {
    this.processing = true;

    const tmpRaw = path.join(
      process.env.TEMP || 'C:\\Windows\\Temp',
      `ifood-qr-job-${job.Id}-${Date.now()}.raw`,
    );

    try {
      const scriptsDir = resolveScriptsDir();
      const captureScript = path.join(scriptsDir, 'capture-print-job.ps1');

      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          captureScript,
          '-PrinterName',
          this.config.printerName,
          '-JobId',
          String(job.Id),
          '-OutputPath',
          tmpRaw,
        ],
        { encoding: 'utf-8', timeout: 45000, windowsHide: true },
      );

      let captureMeta: Record<string, unknown> = {};
      if (result.stdout?.trim()) {
        try {
          captureMeta = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
        } catch {
          // ignore
        }
      }

      if (result.status !== 0 || !captureMeta.ok) {
        this.lastError =
          String(captureMeta.error || result.stderr || 'Falha ao capturar job da fila').slice(0, 300);
        this.logger.error('[QUEUE] Falha ao capturar job', {
          jobId: job.Id,
          error: this.lastError,
          hint: 'Execute o servico como Administrador',
        });
        return;
      }

      if (!fs.existsSync(tmpRaw) || fs.statSync(tmpRaw).size === 0) {
        this.lastError = 'Arquivo capturado vazio';
        this.logger.warn('[QUEUE] Job capturado vazio', { jobId: job.Id });
        return;
      }

      const invoice = this.handler.readInvoiceFromFile(tmpRaw);
      const handled = await this.handler.handleRawInvoice(invoice, 'queue', {
        jobId: job.Id,
        documentName: job.DocumentName,
        jobStatus: job.JobStatus,
        splPath: captureMeta.splPath,
        splBytes: captureMeta.splBytes,
        cancelled: captureMeta.cancelled,
      });

      if (handled.debugFiles) {
        this.lastDebugFiles = handled.debugFiles;
      }

      this.jobsProcessed += 1;
      this.lastJobAt = new Date().toISOString();
      this.lastError = handled.forwarded || !this.config.targetPrinterName ? null : 'Falha ao encaminhar';
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error('[QUEUE] Erro ao processar job', { jobId: job.Id, error: this.lastError });
    } finally {
      try {
        fs.unlinkSync(tmpRaw);
      } catch {
        // ignore
      }
      this.processing = false;
    }
  }
}

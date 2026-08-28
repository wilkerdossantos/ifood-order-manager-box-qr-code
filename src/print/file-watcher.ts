import fs from 'node:fs';
import path from 'node:path';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { PrintJobHandler } from './print-job-handler.js';

export interface FileWatcherDiagnostics {
  enabled: boolean;
  filePath: string;
  jobsProcessed: number;
  lastJobAt: string | null;
  lastError: string | null;
  lastSize: number;
  lastMtime: string | null;
}

/**
 * Monitora o arquivo de saída da impressora virtual (porta FILE:).
 * Quando o arquivo muda (impressão nova), lê o raw ESC/POS, injeta QR
 * e reencaminha para a impressora física.
 *
 * A porta FILE: grava o stream diretamente no arquivo, sem job na fila
 * e sem prompt interativo (ao contrário de PORTPROMPT). Isso torna a
 * captura determinística.
 */
export class FileWatcher {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private jobsProcessed = 0;
  private lastJobAt: string | null = null;
  private lastError: string | null = null;
  private lastSize = 0;
  private lastMtime: string | null = null;
  private filePath: string;

  constructor(
    private config: ServiceConfig,
    private handler: PrintJobHandler,
    private logger: Logger,
  ) {
    this.filePath = path.join(this.config.spoolDir, 'output.prn');
  }

  getDiagnostics(): FileWatcherDiagnostics {
    return {
      enabled: this.config.printFileWatchEnabled,
      filePath: this.filePath,
      jobsProcessed: this.jobsProcessed,
      lastJobAt: this.lastJobAt,
      lastError: this.lastError,
      lastSize: this.lastSize,
      lastMtime: this.lastMtime,
    };
  }

  start(): void {
    if (!this.config.printFileWatchEnabled || process.platform !== 'win32') {
      return;
    }

    fs.mkdirSync(this.config.spoolDir, { recursive: true });

    // Captura o estado inicial (se já houver arquivo, ignora na primeira passada).
    try {
      const st = fs.statSync(this.filePath);
      this.lastSize = st.size;
      this.lastMtime = st.mtime.toISOString();
    } catch {
      this.lastSize = 0;
      this.lastMtime = null;
    }

    this.pollTimer = setInterval(() => {
      void this.pollFile();
    }, 300);

    this.logger.info('[FILE] Watcher de arquivo ativo', {
      file: this.filePath,
      targetPrinter: this.config.targetPrinterName || '(nao configurado)',
      dica: 'A impressora virtual deve usar porta FILE: apontando para output.prn',
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollFile(): Promise<void> {
    if (this.processing) return;

    let st: fs.Stats;
    try {
      st = fs.statSync(this.filePath);
    } catch {
      return; // arquivo ainda não existe
    }

    // Só processa se o arquivo cresceu (nova impressão).
    if (st.size === 0 || st.size === this.lastSize) {
      return;
    }

    const mtime = st.mtime.toISOString();
    if (mtime === this.lastMtime) {
      return;
    }

    this.processing = true;
    try {
      await this.processFile(st.size, mtime);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error('[FILE] Erro ao processar arquivo de impressao', { error: this.lastError });
    } finally {
      this.lastSize = st.size;
      this.lastMtime = mtime;
      this.processing = false;
    }
  }

  private async processFile(size: number, mtime: string): Promise<void> {
    this.logger.info('[FILE] Arquivo de impressao detectado', {
      bytes: size,
      file: this.filePath,
    });

    const invoice = this.handler.readInvoiceFromFile(this.filePath);
    const handled = await this.handler.handleRawInvoice(invoice, 'queue', {
      source: 'file',
      filePath: this.filePath,
      fileBytes: size,
    });

    this.jobsProcessed += 1;
    this.lastJobAt = new Date().toISOString();
    this.lastError = null;
  }
}

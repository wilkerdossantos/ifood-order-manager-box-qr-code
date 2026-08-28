import path from 'node:path';

import { CdpCollector } from '../collector/cdp-collector.js';
import { OrderCache } from '../collector/order-cache.js';
import { loadConfig } from '../config/index.js';
import { FileWatcher } from '../print/file-watcher.js';
import { PrintDebugWriter } from '../print/print-debug-writer.js';
import { PrintJobHandler } from '../print/print-job-handler.js';
import { PrintPreviewWriter } from '../print/preview-writer.js';
import { InvoiceEnricher } from '../qr/invoice-enricher.js';
import { ActivityLog } from '../utils/activity-log.js';
import { createLogger } from '../utils/logger.js';
import { HttpApi } from './http-api.js';
import { createStatusReporter } from './status-reporter.js';

export class QrService {
  private config = loadConfig();
  private logger = createLogger(this.config);
  private activity = new ActivityLog(this.logger);
  private cache = new OrderCache(this.config.cachePath, {
    cacheMaxAgeHours: this.config.cacheMaxAgeHours,
    printCacheWaitMs: this.config.printCacheWaitMs,
    onPersistError: (err) =>
      this.logger.warn('[CACHE] Falha ao persistir cache.json', {
        error: err instanceof Error ? err.message : String(err),
      }),
  });
  private previewWriter = new PrintPreviewWriter(this.config, this.logger);
  private debugWriter = new PrintDebugWriter(this.config, this.logger);
  private enricher = new InvoiceEnricher(this.cache, this.config, this.previewWriter);
  private cdpCollector = new CdpCollector(
    this.config,
    this.cache,
    this.logger,
    this.activity,
  );
  private printJobHandler = new PrintJobHandler(
    this.config,
    this.cache,
    this.enricher,
    this.debugWriter,
    this.logger,
    this.activity,
  );
  private fileWatcher = new FileWatcher(this.config, this.printJobHandler, this.logger);
  private httpApi = new HttpApi({
    config: this.config,
    cache: this.cache,
    enricher: this.enricher,
    logger: this.logger,
    activity: this.activity,
    getDiagnostics: () => ({
      cdpConnected: this.cdpCollector.isConnected(),
      cdpPort: this.config.cdpPort,
      cdpEnabled: this.config.cdpEnabled,
      cdpTargets: this.cdpCollector.getAvailableTargets(),
      cdpAttachedSessions: this.cdpCollector.getAttachedSessionCount(),
      printPreviewDir: this.previewWriter.getPreviewDir(),
      print: this.fileWatcher.getDiagnostics(),
    }),
  });
  private statusReporter = createStatusReporter(
    this.cache,
    this.activity,
    this.logger,
    this.config,
  );

  async start(): Promise<void> {
    this.logger.info('Starting iFood QR Service', {
      enabled: this.config.enabled,
      healthPort: this.config.healthPort,
      logFile: path.join(this.config.logPath, 'service.log'),
      activityFile: path.join(this.config.logPath, 'activity.log'),
    });

    await this.httpApi.start();

    if (this.config.enabled) {
      this.cdpCollector.start();
      this.fileWatcher.start();
    }

    this.activity.startupBanner({
      healthPort: this.config.healthPort,
      cachePath: this.config.cachePath,
      cdpPort: this.config.cdpPort,
      cdpEnabled: this.config.cdpEnabled,
      printPreviewDir: this.previewWriter.getPreviewDir(),
    });

    this.statusReporter.start();

    this.logger.info('iFood QR Service ready');
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping iFood QR Service');
    this.statusReporter.stop();
    this.cache.flush();
    this.cdpCollector.stop();
    this.fileWatcher.stop();
    await this.httpApi.stop();
  }
}

function installProcessGuards(): void {
  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECANCELED') {
      return;
    }
    console.error('Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });
}

async function main(): Promise<void> {
  installProcessGuards();
  const service = new QrService();

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    await service.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await service.start();
}

main().catch((err) => {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') {
    console.error('\n❌ Porta já em uso — outra instância do serviço está rodando.\n');
    console.error('   Solução (PowerShell Admin):');
    console.error('   .\\scripts\\stop-dev.ps1');
    console.error('   npm run dev\n');
    process.exit(1);
  }
  console.error('Fatal error:', err);
  process.exit(1);
});

import path from 'node:path';

import { CdpCollector } from '../collector/cdp-collector.js';
import { ElectronStoreWatcher } from '../collector/electron-store-watcher.js';
import { OrderCache } from '../collector/order-cache.js';
import { ProxyInterceptor } from '../collector/proxy-interceptor.js';
import { loadConfig, getDataDir } from '../config/index.js';
import { PrintBridgeServer } from '../print/bridge-server.js';
import { PrintPreviewWriter } from '../print/preview-writer.js';
import { PrintDebugWriter } from '../print/print-debug-writer.js';
import { PrintJobHandler } from '../print/print-job-handler.js';
import { PrintQueueWatcher } from '../print/queue-watcher.js';
import { SpoolWatcher } from '../print/spool-watcher.js';
import { InvoiceEnricher } from '../qr/invoice-enricher.js';
import { ActivityLog } from '../utils/activity-log.js';
import { createLogger } from '../utils/logger.js';
import { HttpApi } from './http-api.js';
import { createStatusReporter } from './status-reporter.js';

export class QrService {
  private config = loadConfig();
  private logger = createLogger(this.config);
  private activity = new ActivityLog(this.logger);
  private cache = new OrderCache(this.config.cachePath);
  private previewWriter = new PrintPreviewWriter(this.config, this.logger);
  private debugWriter = new PrintDebugWriter(this.config, this.logger);
  private enricher = new InvoiceEnricher(this.cache, this.config, this.previewWriter);
  private proxy = new ProxyInterceptor({
    config: this.config,
    cache: this.cache,
    logger: this.logger,
    activity: this.activity,
    certDir: path.join(getDataDir(), 'certs'),
  });
  private electronWatcher = new ElectronStoreWatcher(
    this.config,
    this.cache,
    this.logger,
    this.activity,
  );
  private cdpCollector = new CdpCollector(
    this.config,
    this.cache,
    this.enricher,
    this.logger,
    this.activity,
  );
  private printBridge = new PrintBridgeServer(
    this.config,
    this.enricher,
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
  private spoolWatcher = new SpoolWatcher(
    this.config,
    this.printJobHandler,
    this.debugWriter,
    this.logger,
  );
  private queueWatcher = new PrintQueueWatcher(this.config, this.printJobHandler, this.logger);
  private httpApi = new HttpApi({
    config: this.config,
    cache: this.cache,
    enricher: this.enricher,
    logger: this.logger,
    activity: this.activity,
    getProxyCaPath: () => this.proxy.getCaCertPath(),
    getDiagnostics: () => ({
      electron: this.electronWatcher.getDiagnostics(),
      cdpConnected: this.cdpCollector.isConnected(),
      cdpPort: this.config.cdpPort,
      cdpEnabled: this.config.cdpEnabled,
      cdpTargets: this.cdpCollector.getAvailableTargets(),
      printPreviewDir: this.previewWriter.getPreviewDir(),
      printDebugDir: this.debugWriter.getDebugDir(),
      spool: this.spoolWatcher.getDiagnostics(),
      queue: this.queueWatcher.getDiagnostics(),
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
      proxyPort: this.config.proxyPort,
      healthPort: this.config.healthPort,
      logFile: path.join(this.config.logPath, 'service.log'),
      activityFile: path.join(this.config.logPath, 'activity.log'),
    });

    await this.httpApi.start();
    await this.printBridge.start();

    if (this.config.enabled && this.config.proxyEnabled) {
      try {
        await this.proxy.start();
        this.logger.info('Proxy mode', {
          mitmEnabled: this.config.mitmEnabled,
          hint: this.config.mitmEnabled
            ? 'MITM ativo — requer certificado CA'
            : 'Túnel transparente — não captura HTTPS, mas não quebra internet',
        });
      } catch (err) {
        this.logger.warn('HTTPS proxy failed to start; electron-store watcher remains active', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      this.logger.info(
        'Proxy desabilitado — modo Gestor Desktop (capture via electron-store, sem proxy Windows)',
      );
    }

    if (this.config.enabled) {
      this.electronWatcher.start();
      this.cdpCollector.start();
      this.spoolWatcher.start();
      this.queueWatcher.start();
    }

    this.activity.startupBanner({
      healthPort: this.config.healthPort,
      proxyPort: this.config.proxyPort,
      pipe: this.printBridge.getPipePath(),
      caCert: this.proxy.getCaCertPath(),
      cachePath: this.config.cachePath,
      watchTargets: this.electronWatcher.getWatchTargets(),
      cdpPort: this.config.cdpPort,
      cdpEnabled: this.config.cdpEnabled,
      printPreviewDir: this.previewWriter.getPreviewDir(),
    });

    this.statusReporter.start();

    this.logger.info('iFood QR Service ready', {
      pipe: this.printBridge.getPipePath(),
      caCert: this.proxy.getCaCertPath(),
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping iFood QR Service');
    this.statusReporter.stop();
    this.cache.flush();
    await this.electronWatcher.stop();
    this.cdpCollector.stop();
    this.queueWatcher.stop();
    await this.spoolWatcher.stop();
    await this.proxy.stop();
    await this.printBridge.stop();
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

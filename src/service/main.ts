import path from 'node:path';

import { ElectronStoreWatcher } from '../collector/electron-store-watcher.js';
import { OrderCache } from '../collector/order-cache.js';
import { ProxyInterceptor } from '../collector/proxy-interceptor.js';
import { loadConfig, getDataDir } from '../config/index.js';
import { PrintBridgeServer } from '../print/bridge-server.js';
import { InvoiceEnricher } from '../qr/invoice-enricher.js';
import { createLogger } from '../utils/logger.js';
import { HttpApi } from './http-api.js';

export class QrService {
  private config = loadConfig();
  private logger = createLogger(this.config);
  private cache = new OrderCache(this.config.cachePath);
  private enricher = new InvoiceEnricher(this.cache, this.config);
  private proxy = new ProxyInterceptor({
    config: this.config,
    cache: this.cache,
    logger: this.logger,
    certDir: path.join(getDataDir(), 'certs'),
  });
  private electronWatcher = new ElectronStoreWatcher(this.config, this.cache, this.logger);
  private printBridge = new PrintBridgeServer(this.config, this.enricher, this.logger);
  private httpApi = new HttpApi({
    config: this.config,
    cache: this.cache,
    enricher: this.enricher,
    logger: this.logger,
    getProxyCaPath: () => this.proxy.getCaCertPath(),
  });

  async start(): Promise<void> {
    this.logger.info('Starting iFood QR Service', {
      enabled: this.config.enabled,
      proxyPort: this.config.proxyPort,
      healthPort: this.config.healthPort,
    });

    await this.httpApi.start();
    await this.printBridge.start();

    if (this.config.enabled) {
      try {
        await this.proxy.start();
      } catch (err) {
        this.logger.warn('HTTPS proxy failed to start; electron-store watcher remains active', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.electronWatcher.start();
    }

    this.logger.info('iFood QR Service ready', {
      pipe: this.printBridge.getPipePath(),
      caCert: this.proxy.getCaCertPath(),
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping iFood QR Service');
    this.cache.flush();
    await this.electronWatcher.stop();
    await this.proxy.stop();
    await this.printBridge.stop();
    await this.httpApi.stop();
  }
}

async function main(): Promise<void> {
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
  console.error('Fatal error:', err);
  process.exit(1);
});

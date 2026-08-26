import type { ServiceConfig } from '../config/types.js';
import type { OrderCache } from '../collector/order-cache.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { Logger } from '../utils/logger.js';

export class StatusReporter {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private cache: OrderCache,
    private activity: ActivityLog,
    private logger: Logger,
    private intervalSeconds: number,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.report(), this.intervalSeconds * 1000);
    // First status after a short delay so startup banner is readable
    setTimeout(() => this.report(), 5000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private report(): void {
    const stats = this.cache.getStats();
    const metrics = this.activity.getMetrics();
    this.activity.statusSnapshot({
      uniqueOrders: stats.uniqueOrders,
      orderKeys: stats.orderKeys,
      merchants: stats.merchants,
      proxyHits: metrics.proxyHits,
      lastCaptureAt: metrics.lastCaptureAt,
      lastProxyUrl: metrics.lastProxyUrl,
    });
  }
}

export function createStatusReporter(
  cache: OrderCache,
  activity: ActivityLog,
  logger: Logger,
  config: ServiceConfig,
): StatusReporter {
  return new StatusReporter(cache, activity, logger, config.statusIntervalSeconds);
}

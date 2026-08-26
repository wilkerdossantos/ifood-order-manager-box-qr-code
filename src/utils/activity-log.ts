import type { OrderData } from '../config/types.js';
import type { Logger } from './logger.js';

export type CaptureSource = 'proxy' | 'electron-store' | 'api' | 'print-bridge';

export class ActivityLog {
  private proxyHits = 0;
  private ordersCaptured = 0;
  private lastCaptureAt: string | null = null;
  private lastProxyUrl: string | null = null;

  constructor(private logger: Logger) {}

  startupBanner(config: {
    healthPort: number;
    proxyPort: number;
    pipe: string;
    caCert: string;
    cachePath: string;
    watchTargets: string[];
  }): void {
    const lines = [
      '',
      '══════════════════════════════════════════════════════════',
      '  iFood QR Service — rodando',
      '══════════════════════════════════════════════════════════',
      '',
      '  Como verificar se está funcionando:',
      '',
      `  1. Health check:  http://127.0.0.1:${config.healthPort}/health`,
      `  2. Cache stats:   http://127.0.0.1:${config.healthPort}/cache/stats`,
      `  3. Pedidos:       http://127.0.0.1:${config.healthPort}/orders`,
      '',
      '  Para capturar pedidos via proxy HTTPS:',
      `  • Configure proxy Windows → 127.0.0.1:${config.proxyPort}`,
      `  • Instale certificado CA → ${config.caCert}`,
      '  • Abra o Gestor de Pedidos e receba um pedido',
      '',
      '  A cada 30s este terminal mostra um resumo [STATUS].',
      '  Quando um pedido for capturado, verá [PEDIDO CAPTURADO].',
      '',
      `  Cache: ${config.cachePath}`,
      `  Print pipe: ${config.pipe}`,
      ...(config.watchTargets.length
        ? [`  Electron watcher: ${config.watchTargets.length} alvo(s)`]
        : ['  Electron watcher: nenhum path encontrado (proxy ainda funciona)']),
      '',
      '══════════════════════════════════════════════════════════',
      '',
    ];
    for (const line of lines) {
      this.logger.info(line);
    }
  }

  proxyRequest(method: string, url: string): void {
    this.proxyHits += 1;
    this.lastProxyUrl = url;
    const shortUrl = url.length > 120 ? `${url.slice(0, 120)}...` : url;
    this.logger.info('[PROXY] Tráfego interceptado', {
      method,
      url: shortUrl,
      totalHits: this.proxyHits,
    });
  }

  ordersIngested(orders: OrderData[], source: CaptureSource, detail?: string): void {
    this.ordersCaptured += orders.length;
    this.lastCaptureAt = new Date().toISOString();

    for (const order of orders) {
      this.logger.info('[PEDIDO CAPTURADO]', {
        source,
        pedido: order.displayId || order.orderId || 'N/A',
        loja: order.merchantId || 'pendente',
        coleta: order.pickupCode || 'N/A',
        tipo: order.orderType,
        id: order.orderId || 'N/A',
        detail,
      });
    }
  }

  printEnriched(displayId: string, payload: string): void {
    this.logger.info('[IMPRESSÃO] QR adicionado à comanda', {
      pedido: displayId,
      payload,
    });
  }

  statusSnapshot(stats: {
    uniqueOrders: number;
    orderKeys: number;
    merchants: number;
    proxyHits: number;
    lastCaptureAt: string | null;
    lastProxyUrl: string | null;
  }): void {
    if (stats.uniqueOrders === 0 && stats.proxyHits === 0) {
      this.logger.info('[STATUS] Aguardando dados — nenhum pedido no cache ainda', {
        dica: 'Configure proxy 127.0.0.1:8888 + certificado CA, ou aguarde o Gestor gravar no electron-store',
        health: 'http://127.0.0.1:7420/cache/stats',
      });
      return;
    }

    this.logger.info('[STATUS] Resumo do serviço', {
      pedidosNoCache: stats.uniqueOrders,
      chavesCache: stats.orderKeys,
      lojas: stats.merchants,
      requisicoesProxy: stats.proxyHits,
      ultimaCaptura: stats.lastCaptureAt || 'nunca',
      ultimaUrlProxy: stats.lastProxyUrl ? stats.lastProxyUrl.slice(0, 80) : 'nenhuma',
    });
  }

  getMetrics() {
    return {
      proxyHits: this.proxyHits,
      ordersCaptured: this.ordersCaptured,
      lastCaptureAt: this.lastCaptureAt,
      lastProxyUrl: this.lastProxyUrl,
    };
  }
}

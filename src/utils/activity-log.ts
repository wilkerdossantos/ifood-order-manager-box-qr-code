import type { OrderData } from '../config/types.js';
import type { Logger } from './logger.js';

export type CaptureSource = 'cdp' | 'api';

export class ActivityLog {
  private ordersCaptured = 0;
  private lastCaptureAt: string | null = null;

  constructor(private logger: Logger) {}

  startupBanner(config: {
    healthPort: number;
    cachePath: string;
    cdpPort: number;
    cdpEnabled: boolean;
    printPreviewDir: string;
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
      '  PASSO 1: Inicie o Gestor com debug (obrigatório para capturar pedidos):',
      `  • Execute: .\\scripts\\enable-gestor-debug.ps1`,
      `  • Ou adicione ao atalho do Gestor: --remote-debugging-port=${config.cdpPort}`,
      `  • Feche o Gestor e abra novamente pelo atalho criado`,
      '',
      '  PASSO 2: Rode npm run dev e receba um pedido no Gestor',
      '  Você deve ver: [CDP] Conectado + [PEDIDO CAPTURADO]',
      '',
      '  PASSO 3: Imprima a comanda (Microsoft Print to PDF funciona para teste)',
      '  • O hook vive no ipcHandler do Gestor Desktop (main process)',
      '  • No PDF, o QR aparece como texto legível: QR: LOJA:...|NP:...',
      `  • Preview salvo em: ${config.printPreviewDir}`,
      '  • Log hook: C:\\ProgramData\\iFoodQrService\\logs\\print-hook.log',
      '  • Log npm run dev: [IMPRESSÃO] QR adicionado',
      '',
      `  Diagnóstico: http://127.0.0.1:${config.healthPort}/diagnostics`,
      '  A cada 30s este terminal mostra um resumo [STATUS].',
      '  Quando um pedido for capturado, verá [PEDIDO CAPTURADO].',
      '',
      `  Cache: ${config.cachePath}`,
      '',
      '══════════════════════════════════════════════════════════',
      '',
    ];
    for (const line of lines) {
      this.logger.info(line);
    }
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
    lastCaptureAt: string | null;
  }): void {
    if (stats.uniqueOrders === 0) {
      this.logger.info('[STATUS] Aguardando pedidos no Gestor Desktop', {
        dica: 'Execute enable-gestor-debug.ps1, reinicie o Gestor e verifique /diagnostics (cdpConnected: true)',
        health: 'http://127.0.0.1:7420/diagnostics',
      });
      return;
    }

    this.logger.info('[STATUS] Resumo do serviço', {
      pedidosNoCache: stats.uniqueOrders,
      chavesCache: stats.orderKeys,
      lojas: stats.merchants,
      ultimaCaptura: stats.lastCaptureAt || 'nunca',
    });
  }

  getMetrics() {
    return {
      ordersCaptured: this.ordersCaptured,
      lastCaptureAt: this.lastCaptureAt,
    };
  }
}

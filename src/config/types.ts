export interface OrderData {
  merchantId: string;
  displayId: string;
  pickupCode: string;
  orderType: string;
  orderId: string;
}

export interface ServiceConfig {
  enabled: boolean;
  pdfMode: boolean;
  healthPort: number;
  cachePath: string;
  logPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  statusIntervalSeconds: number;
  ingestUrlPattern: string;
  /** Captura via Chrome DevTools Protocol (porta debug do Electron) */
  cdpEnabled: boolean;
  cdpPort: number;
  cdpReconnectSeconds: number;
  /** Salva cópia legível de cada comanda enriquecida (útil com Microsoft Print to PDF) */
  printPreviewEnabled: boolean;
  printPreviewDir: string;
  /** Tempo máximo de espera pelo pedido no cache antes de imprimir sem QR (ms) */
  printCacheWaitMs: number;
  /** Idade máxima de pedidos no cache (horas); 0 = sem expiração */
  cacheMaxAgeHours: number;
}

export const DEFAULT_CONFIG: ServiceConfig = {
  enabled: true,
  pdfMode: false,
  healthPort: 7420,
  cachePath: '',
  logPath: '',
  logLevel: 'info',
  statusIntervalSeconds: 30,
  ingestUrlPattern: '/orders?(?:\\/|\\?|$)|events:polling|expedition|merchant|store|totem',
  cdpEnabled: true,
  cdpPort: 9222,
  cdpReconnectSeconds: 8,
  printPreviewEnabled: true,
  printPreviewDir: '',
  printCacheWaitMs: 2000,
  cacheMaxAgeHours: 24,
};

export interface PrintMeta {
  orderId?: string;
  merchantId?: string;
}

export interface CacheStats {
  orderKeys: number;
  uniqueOrders: number;
  merchants: number;
  lastUpdated?: string;
}

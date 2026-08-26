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
  proxyPort: number;
  healthPort: number;
  cachePath: string;
  logPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  statusIntervalSeconds: number;
  logProxyTraffic: boolean;
  /** Inicia servidor proxy local. Para Gestor Desktop, deixe false. */
  proxyEnabled: boolean;
  /**
   * Intercepta HTTPS (MITM) para capturar pedidos.
   * false = túnel transparente (não quebra internet, mas não captura HTTPS).
   * Para Gestor Desktop use false e capture via electron-store.
   */
  mitmEnabled: boolean;
  printerName: string;
  targetPrinterName: string;
  pipeName: string;
  electronAppDataPaths: string[];
  ingestUrlPattern: string;
  proxyHosts: string[];
  /** Scan electron-store a cada N segundos */
  scanIntervalSeconds: number;
  /** Captura via Chrome DevTools Protocol (porta debug do Electron) */
  cdpEnabled: boolean;
  cdpPort: number;
  cdpReconnectSeconds: number;
  /** Salva cópia legível de cada comanda enriquecida (útil com Microsoft Print to PDF) */
  printPreviewEnabled: boolean;
  printPreviewDir: string;
}

export const DEFAULT_CONFIG: ServiceConfig = {
  enabled: true,
  pdfMode: false,
  proxyPort: 8888,
  healthPort: 7420,
  cachePath: '',
  logPath: '',
  logLevel: 'info',
  statusIntervalSeconds: 30,
  logProxyTraffic: true,
  proxyEnabled: false,
  mitmEnabled: false,
  printerName: 'iFood QR Bridge',
  targetPrinterName: '',
  pipeName: 'ifood-qr-service',
  electronAppDataPaths: [],
  ingestUrlPattern: '/orders?(?:\\/|\\?|$)|events:polling|expedition|merchant|store|totem',
  proxyHosts: [
    'gestordepedidos.ifood.com.br',
    'gestordepedidos-review-app.ifood.com.br',
    'api.ifood.com.br',
    'merchant-api.ifood.com.br',
  ],
  scanIntervalSeconds: 5,
  cdpEnabled: true,
  cdpPort: 9222,
  cdpReconnectSeconds: 8,
  printPreviewEnabled: true,
  printPreviewDir: '',
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

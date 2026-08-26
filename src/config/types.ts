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
  printerName: string;
  targetPrinterName: string;
  pipeName: string;
  electronAppDataPaths: string[];
  ingestUrlPattern: string;
  proxyHosts: string[];
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

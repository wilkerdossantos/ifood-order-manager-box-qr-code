import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { OrderCache } from './order-cache.js';
import {
  discoverElectronAppDataPaths,
  extractJsonObjectsFromBuffer,
  parseElectronStoreContent,
} from './storage-parser.js';

const IGNORED_DIR_NAMES = new Set([
  'Network',
  'GPUCache',
  'Code Cache',
  'Cache',
  'Cache_Data',
  'blob_storage',
  'Session Storage',
  'Service Worker',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'ShaderCache',
  'Crashpad',
  'Dictionaries',
  'Safe Browsing',
  'WebStorage',
  'Shared Dictionary',
  'SharedStorage',
  'VideoDecodeStats',
  'GrShaderCache',
  'component_crx_cache',
  'extensions_crx_cache',
  'optimization_guide_hint_cache_store',
]);

const IGNORED_FILE_NAMES = new Set([
  'Cookies',
  'Cookies-journal',
  'Network Persistent State',
  'TransportSecurity',
  'Trust Tokens',
  'Trust Tokens-journal',
  'LOCK',
  'CURRENT',
  'MANIFEST-000001',
]);

const IGNORED_PATH_PATTERN =
  /[/\\](Network|GPUCache|Code Cache|Cache|Session Storage|Service Worker|blob_storage)([/\\]|$)/i;

const SCAN_FILE_EXTENSIONS = new Set(['.json', '.log', '.ldb', '.sst']);

export interface ScanDiagnostics {
  appDataPaths: string[];
  filesScanned: number;
  jsonBlobsFound: number;
  ordersCaptured: number;
  sampleFiles: string[];
}

export class ElectronStoreWatcher {
  private watcher: FSWatcher | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private lastWatchTargets: string[] = [];
  private lastDiagnostics: ScanDiagnostics = {
    appDataPaths: [],
    filesScanned: 0,
    jsonBlobsFound: 0,
    ordersCaptured: 0,
    sampleFiles: [],
  };

  constructor(
    private config: ServiceConfig,
    private cache: OrderCache,
    private logger: Logger,
    private activity: ActivityLog,
  ) {}

  getWatchTargets(): string[] {
    return [...this.lastWatchTargets];
  }

  getDiagnostics(): ScanDiagnostics {
    return { ...this.lastDiagnostics };
  }

  start(): void {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const discovered = discoverElectronAppDataPaths(appData);
    const configured = this.config.electronAppDataPaths.filter((p) => fs.existsSync(p));
    const existingPaths = [...new Set([...configured, ...discovered])];

    this.lastDiagnostics.appDataPaths = existingPaths;

    if (existingPaths.length === 0) {
      this.logger.warn('[ELECTRON] Nenhuma pasta do Gestor encontrada', {
        appData,
        dica: 'Abra o Gestor de Pedidos Desktop pelo menos uma vez',
      });
      return;
    }

    this.logger.info('[ELECTRON] Pastas encontradas', { paths: existingPaths });

    const watchTargets: string[] = [];
    for (const basePath of existingPaths) {
      watchTargets.push(...this.collectWatchTargets(basePath));
    }
    this.lastWatchTargets = watchTargets;

    const captured = this.runFullScan(existingPaths);
    this.logger.info('[ELECTRON] Scan inicial concluído', {
      arquivos: this.lastDiagnostics.filesScanned,
      jsonEncontrados: this.lastDiagnostics.jsonBlobsFound,
      pedidosCapturados: captured,
    });

    if (watchTargets.length > 0) {
      this.watcher = chokidar.watch(watchTargets, {
        ignored: (watchPath) => this.shouldIgnorePath(watchPath),
        persistent: true,
        ignoreInitial: true,
        ignorePermissionErrors: true,
        awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
        depth: 8,
      });

      this.watcher.on('add', (filePath) => this.handleFileChange(filePath));
      this.watcher.on('change', (filePath) => this.handleFileChange(filePath));
      this.watcher.on('error', (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.debug('[ELECTRON] watcher error (ignorado)', { error: err.message });
      });
    }

    const intervalMs = (this.config.scanIntervalSeconds || 10) * 1000;
    this.scanTimer = setInterval(() => {
      const n = this.runFullScan(existingPaths);
      if (n > 0) {
        this.logger.info('[ELECTRON] Scan periódico capturou pedidos', { count: n });
      }
    }, intervalMs);

    this.logger.info('[ELECTRON] Watcher ativo', {
      watchTargets,
      scanIntervalSeconds: this.config.scanIntervalSeconds,
    });
  }

  stop(): Promise<void> {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    return this.watcher?.close() ?? Promise.resolve();
  }

  private runFullScan(basePaths: string[]): number {
    let totalCaptured = 0;
    let filesScanned = 0;
    let jsonBlobsFound = 0;
    const sampleFiles: string[] = [];

    for (const basePath of basePaths) {
      for (const filePath of this.listScannableFiles(basePath)) {
        filesScanned++;
        if (sampleFiles.length < 8) sampleFiles.push(filePath);

        const result = this.processFile(filePath);
        totalCaptured += result.captured;
        jsonBlobsFound += result.blobs;
      }
    }

    this.lastDiagnostics = {
      appDataPaths: basePaths,
      filesScanned,
      jsonBlobsFound,
      ordersCaptured: totalCaptured,
      sampleFiles,
    };

    return totalCaptured;
  }

  private listScannableFiles(dir: string, depth = 0): string[] {
    if (depth > 10) return [];
    const files: string[] = [];

    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (this.shouldIgnorePath(fullPath)) continue;

        if (entry.isDirectory()) {
          files.push(...this.listScannableFiles(fullPath, depth + 1));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const base = entry.name.toLowerCase();
          if (
            SCAN_FILE_EXTENSIONS.has(ext) ||
            base.includes('local-storage') ||
            base === 'config.json'
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // locked or permission denied
    }

    return files;
  }

  private collectWatchTargets(basePath: string): string[] {
    const candidates = [
      path.join(basePath, 'local-storage.json'),
      path.join(basePath, 'config.json'),
      path.join(basePath, 'IndexedDB'),
      path.join(basePath, 'Local Storage'),
    ];
    return candidates.filter((c) => {
      try {
        return fs.existsSync(c);
      } catch {
        return false;
      }
    });
  }

  private shouldIgnorePath(watchPath: string): boolean {
    if (IGNORED_PATH_PATTERN.test(watchPath)) return true;
    if (IGNORED_FILE_NAMES.has(path.basename(watchPath))) return true;
    return watchPath.split(/[/\\]/).some((part) => IGNORED_DIR_NAMES.has(part));
  }

  private handleFileChange(filePath: string): void {
    const result = this.processFile(filePath);
    if (result.captured > 0) {
      this.logger.info('[ELECTRON] Arquivo atualizado — pedidos capturados', {
        file: filePath,
        count: result.captured,
      });
    }
  }

  private processFile(filePath: string): { captured: number; blobs: number } {
    if (this.shouldIgnorePath(filePath)) return { captured: 0, blobs: 0 };

    const ext = path.extname(filePath).toLowerCase();
    let captured = 0;
    let blobs = 0;

    try {
      if (ext === '.json' || filePath.includes('local-storage')) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        captured += parseElectronStoreContent(parsed, this.cache, filePath);
        blobs += 1;
      } else {
        const raw = fs.readFileSync(filePath);
        const objects = extractJsonObjectsFromBuffer(raw);
        blobs += objects.length;
        for (const obj of objects) {
          const orders = this.cache.ingestPayload(obj);
          captured += orders.length;
        }
      }
    } catch {
      return { captured: 0, blobs: 0 };
    }

    if (captured > 0) {
      const orders = this.cache.getAllOrders().slice(-captured);
      this.activity.ordersIngested(orders, 'electron-store', filePath);
    }

    return { captured, blobs };
  }
}

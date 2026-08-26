import fs from 'node:fs';
import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { OrderCache } from './order-cache.js';

const ORDER_KEY_PATTERNS = [
  /order/i,
  /displayId/i,
  /pickupCode/i,
  /merchantId/i,
  /events/i,
  /polling/i,
];

/** Chromium/Electron dirs that are locked while the app runs — never watch these. */
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

/** Individual files that Chromium locks (EBUSY on Windows). */
const IGNORED_FILE_NAMES = new Set([
  'Cookies',
  'Cookies-journal',
  'Network Persistent State',
  'TransportSecurity',
  'Trust Tokens',
  'Trust Tokens-journal',
  'LOCK',
  'LOG',
  'LOG.old',
  'CURRENT',
  'MANIFEST-000001',
  '000003.log',
]);

const IGNORED_PATH_PATTERN =
  /[/\\](Network|GPUCache|Code Cache|Cache|Session Storage|Service Worker|blob_storage)([/\\]|$)/i;

export class ElectronStoreWatcher {
  private watcher: FSWatcher | null = null;
  private lastWatchTargets: string[] = [];

  constructor(
    private config: ServiceConfig,
    private cache: OrderCache,
    private logger: Logger,
    private activity: ActivityLog,
  ) {}

  getWatchTargets(): string[] {
    return [...this.lastWatchTargets];
  }

  start(): void {
    const existingPaths = this.config.electronAppDataPaths.filter((p) => fs.existsSync(p));
    if (existingPaths.length === 0) {
      this.logger.warn('No Electron app data paths found', {
        paths: this.config.electronAppDataPaths,
      });
      return;
    }

    const watchTargets: string[] = [];
    for (const basePath of existingPaths) {
      this.scanDirectory(basePath);
      watchTargets.push(...this.collectWatchTargets(basePath));
    }

    if (watchTargets.length === 0) {
      this.logger.warn('No watchable Electron store targets found', { paths: existingPaths });
      this.lastWatchTargets = [];
      return;
    }

    this.lastWatchTargets = watchTargets;

    this.watcher = chokidar.watch(watchTargets, {
      ignored: (watchPath) => this.shouldIgnorePath(watchPath),
      persistent: true,
      ignoreInitial: true,
      ignorePermissionErrors: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 4,
    });

    this.watcher.on('add', (filePath: string) => this.handleFileChange(filePath));
    this.watcher.on('change', (filePath: string) => this.handleFileChange(filePath));
    this.watcher.on('error', (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      // Locked Chromium files (e.g. Network/Cookies) must not crash the service.
      this.logger.debug('Electron store watcher error (ignored)', {
        error: err.message,
        code: (err as NodeJS.ErrnoException).code,
      });
    });

    this.logger.info('Electron store watcher started', {
      paths: existingPaths,
      watchTargets,
    });
  }

  stop(): Promise<void> {
    return this.watcher?.close() ?? Promise.resolve();
  }

  /** Only watch paths that may contain order cache data — not the entire profile. */
  private collectWatchTargets(basePath: string): string[] {
    const candidates = [
      path.join(basePath, 'local-storage.json'),
      path.join(basePath, 'config.json'),
      path.join(basePath, 'IndexedDB'),
      path.join(basePath, 'Local Storage'),
    ];

    return candidates.filter((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    });
  }

  private shouldIgnorePath(watchPath: string): boolean {
    if (IGNORED_PATH_PATTERN.test(watchPath)) return true;

    const base = path.basename(watchPath);
    if (IGNORED_FILE_NAMES.has(base)) return true;

    const parts = watchPath.split(/[/\\]/);
    return parts.some((part) => IGNORED_DIR_NAMES.has(part));
  }

  private handleFileChange(filePath: string): void {
    if (this.shouldIgnorePath(filePath)) return;

    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();

    if (ext === '.json' || base.includes('local-storage') || base.includes('config')) {
      this.parseJsonFile(filePath);
      return;
    }

    if (filePath.includes('Local Storage') || filePath.includes('leveldb') || filePath.includes('IndexedDB')) {
      this.parseLevelDbFile(filePath);
    }
  }

  private scanDirectory(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (this.shouldIgnorePath(fullPath)) continue;

        if (entry.isDirectory()) {
          this.scanDirectory(fullPath);
        } else if (entry.isFile()) {
          this.handleFileChange(fullPath);
        }
      }
    } catch {
      // permission, missing dir, or locked file during initial scan
    }
  }

  private parseJsonFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      this.ingestDeep(parsed, filePath);
    } catch {
      // not valid json or file locked
    }
  }

  private parseLevelDbFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath);
      const text = raw.toString('utf-8', 0, Math.min(raw.length, 512 * 1024));
      const jsonMatches = text.match(/\{[^{}]*"(?:displayId|orderId|merchantId|pickupCode)"[^{}]*\}/g);
      if (!jsonMatches) return;
      for (const match of jsonMatches) {
        try {
          this.ingestDeep(JSON.parse(match), filePath);
        } catch {
          // skip invalid fragments
        }
      }
    } catch {
      // binary leveldb or locked file
    }
  }

  private ingestDeep(data: unknown, source: string): void {
    if (Array.isArray(data)) {
      data.forEach((item) => this.ingestDeep(item, source));
      return;
    }
    if (!data || typeof data !== 'object') return;

    const obj = data as Record<string, unknown>;

    if (obj.localStorage && typeof obj.localStorage === 'string') {
      try {
        this.ingestDeep(JSON.parse(obj.localStorage), source);
      } catch {
        // ignore
      }
    }

    const hasOrderField = ORDER_KEY_PATTERNS.some((pattern) =>
      JSON.stringify(obj).match(pattern),
    );
    if (hasOrderField) {
      const captured = this.cache.ingestPayload(obj);
      if (captured.length > 0) {
        this.activity.ordersIngested(captured, 'electron-store', source);
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        this.ingestDeep(value, source);
      } else if (typeof value === 'string' && value.startsWith('{')) {
        try {
          this.ingestDeep(JSON.parse(value), source);
        } catch {
          // not json string
        }
      }
    }
  }
}

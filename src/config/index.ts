import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ServiceConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

function getProgramDataDir(): string {
  if (process.platform === 'win32') {
    return process.env.ProgramData || 'C:\\ProgramData';
  }
  return path.join(os.homedir(), '.ifood-qr-service');
}

export function getDataDir(): string {
  return path.join(getProgramDataDir(), 'iFoodQrService');
}

export function loadConfig(configPath?: string): ServiceConfig {
  const dataDir = getDataDir();
  const resolvedPath = configPath || path.join(dataDir, 'config.json');

  let fileConfig: Partial<ServiceConfig> = {};
  if (fs.existsSync(resolvedPath)) {
    try {
      // Strip BOM (U+FEFF) adicionado pelo PowerShell 5.1 (Set-Content -Encoding UTF8).
      const raw = fs.readFileSync(resolvedPath, 'utf-8').replace(/^﻿/, '');
      fileConfig = JSON.parse(raw) as Partial<ServiceConfig>;
    } catch {
      // use defaults
    }
  }

  const config: ServiceConfig = {
    ...DEFAULT_CONFIG,
    cachePath: path.join(dataDir, 'cache.json'),
    logPath: path.join(dataDir, 'logs'),
    spoolDir: path.join(dataDir, 'spool'),
    ...fileConfig,
  };

  if (!config.spoolDir) {
    config.spoolDir = path.join(dataDir, 'spool');
  }
  if (!config.printDebugDir) {
    config.printDebugDir = path.join(config.spoolDir, 'debug');
  }

  fs.mkdirSync(path.dirname(config.cachePath), { recursive: true });
  fs.mkdirSync(config.logPath, { recursive: true });

  if (!fs.existsSync(resolvedPath)) {
    fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  return config;
}

export function saveConfig(config: ServiceConfig, configPath?: string): void {
  const dataDir = getDataDir();
  const resolvedPath = configPath || path.join(dataDir, 'config.json');
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2), 'utf-8');
}

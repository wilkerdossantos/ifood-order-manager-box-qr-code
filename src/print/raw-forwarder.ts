import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Logger } from '../utils/logger.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export function resolveScriptsDir(): string {
  if (process.env.IFOOD_QR_SCRIPTS_DIR && fs.existsSync(process.env.IFOOD_QR_SCRIPTS_DIR)) {
    return process.env.IFOOD_QR_SCRIPTS_DIR;
  }
  const candidates = [
    path.join(process.cwd(), 'scripts'),
    path.join(MODULE_DIR, '../../scripts'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'iFoodQrService', 'scripts'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'forward-raw-print.ps1'))) {
      return dir;
    }
  }
  return candidates[0];
}

export interface ForwardOptions {
  textMode?: boolean;
}

export function forwardToPrinter(
  content: string,
  printerName: string,
  logger: Logger,
  options: ForwardOptions = {},
): boolean {
  if (!printerName) {
    logger.warn('[PRINT] targetPrinterName nao configurado');
    return false;
  }

  const scriptsDir = resolveScriptsDir();
  const scriptName = options.textMode ? 'forward-text-print.ps1' : 'forward-raw-print.ps1';
  const forwardScript = path.join(scriptsDir, scriptName);

  if (!fs.existsSync(forwardScript)) {
    logger.error('[PRINT] script de encaminhamento nao encontrado', { forwardScript, scriptsDir });
    return false;
  }

  const ext = options.textMode ? '.txt' : '.raw';
  const tmpFile = path.join(
    process.env.TEMP || 'C:\\Windows\\Temp',
    `ifood-qr-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  );

  try {
    if (options.textMode) {
      fs.writeFileSync(tmpFile, content, 'utf-8');
    } else {
      fs.writeFileSync(tmpFile, Buffer.from(content, 'latin1'));
    }

    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        forwardScript,
        '-PrinterName',
        printerName,
        '-FilePath',
        tmpFile,
      ],
      { encoding: 'utf-8', timeout: 45000, windowsHide: true },
    );

    if (result.status !== 0) {
      logger.error('[PRINT] Falha ao encaminhar impressao', {
        printer: printerName,
        mode: options.textMode ? 'TEXT' : 'RAW',
        stderr: result.stderr?.slice(0, 300),
        stdout: result.stdout?.slice(0, 300),
      });
      return false;
    }

    logger.info('[PRINT] Comanda encaminhada', {
      printer: printerName,
      mode: options.textMode ? 'TEXT' : 'RAW',
    });
    return true;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

/** @deprecated Use forwardToPrinter */
export function forwardRawToPrinter(
  content: string,
  printerName: string,
  logger: Logger,
): boolean {
  return forwardToPrinter(content, printerName, logger, { textMode: false });
}

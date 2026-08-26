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

export function forwardRawToPrinter(
  content: string,
  printerName: string,
  logger: Logger,
): boolean {
  if (!printerName) {
    logger.warn('[SPOOL] targetPrinterName nao configurado');
    return false;
  }

  const scriptsDir = resolveScriptsDir();
  const forwardScript = path.join(scriptsDir, 'forward-raw-print.ps1');
  if (!fs.existsSync(forwardScript)) {
    logger.error('[SPOOL] forward-raw-print.ps1 nao encontrado', { scriptsDir });
    return false;
  }

  const tmpFile = path.join(
    process.env.TEMP || 'C:\\Windows\\Temp',
    `ifood-qr-${Date.now()}-${Math.random().toString(36).slice(2)}.raw`,
  );

  try {
    fs.writeFileSync(tmpFile, Buffer.from(content, 'latin1'));

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
      logger.error('[SPOOL] Falha ao encaminhar impressao', {
        printer: printerName,
        stderr: result.stderr?.slice(0, 300),
        stdout: result.stdout?.slice(0, 300),
      });
      return false;
    }

    logger.info('[SPOOL] Comanda encaminhada para impressora', { printer: printerName });
    return true;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

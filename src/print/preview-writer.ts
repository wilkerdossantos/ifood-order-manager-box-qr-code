import fs from 'node:fs';
import path from 'node:path';

import type { ServiceConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';

export interface PrintPreviewEntry {
  invoice: string;
  payload?: string;
  pdfMode: boolean;
  printerName?: string;
  displayId?: string;
}

export class PrintPreviewWriter {
  private dir: string;

  constructor(
    private config: ServiceConfig,
    private logger: Logger,
  ) {
    this.dir =
      config.printPreviewDir ||
      path.join(path.dirname(config.cachePath), 'print-preview');
  }

  getPreviewDir(): string {
    return this.dir;
  }

  save(entry: PrintPreviewEntry): string | null {
    if (!this.config.printPreviewEnabled) return null;

    fs.mkdirSync(this.dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const label = entry.displayId || 'pedido';
    const filePath = path.join(this.dir, `${stamp}-${label}.txt`);

    const header = [
      `# iFood QR — preview da comanda`,
      `# Gerado: ${new Date().toISOString()}`,
      `# Impressora: ${entry.printerName || 'N/A'}`,
      `# Modo: ${entry.pdfMode ? 'PDF (texto legível)' : 'Térmica (ESC/POS)'}`,
      entry.payload ? `# Payload QR: ${entry.payload}` : '# Payload QR: N/A',
      '',
      '--- COMANDA ---',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, header + entry.invoice, 'utf-8');
    this.logger.info('[PRINT] Preview salvo', { file: filePath, pdfMode: entry.pdfMode });
    return filePath;
  }
}

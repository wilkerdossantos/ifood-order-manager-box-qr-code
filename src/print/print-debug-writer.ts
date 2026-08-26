import fs from 'node:fs';
import path from 'node:path';

import type { ServiceConfig } from '../config/types.js';
import type { EnrichResult } from '../qr/invoice-enricher.js';
import { stripEscPosToText } from '../qr/escpos.js';
import { extractDisplayIdFromInvoice } from '../utils/strings.js';
import type { Logger } from '../utils/logger.js';

export interface PrintDebugEntry {
  timestamp: string;
  source: string;
  rawBytes: number;
  displayIdExtracted: string;
  readablePath: string;
  rawPath: string;
  enrichedPath: string;
  metaPath: string;
  modified: boolean;
  payload?: string;
}

export class PrintDebugWriter {
  private dir: string;
  private lastEntry: PrintDebugEntry | null = null;

  constructor(
    private config: ServiceConfig,
    private logger: Logger,
  ) {
    this.dir =
      config.printDebugDir ||
      path.join(config.spoolDir || path.dirname(config.cachePath), 'debug');
  }

  getDebugDir(): string {
    return this.dir;
  }

  getLastEntry(): PrintDebugEntry | null {
    return this.lastEntry;
  }

  saveJob(
    source: string,
    rawInvoice: string,
    detail: EnrichResult,
    extra?: Record<string, unknown>,
  ): PrintDebugEntry | null {
    if (!this.config.printDebugEnabled) return null;

    fs.mkdirSync(this.dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const displayId = extractDisplayIdFromInvoice(stripEscPosToText(rawInvoice)) ||
      extractDisplayIdFromInvoice(rawInvoice) ||
      'sem-pedido';
    const label = `${stamp}-${displayId}`;

    const readable = stripEscPosToText(rawInvoice);
    const readablePath = path.join(this.dir, `${label}-readable.txt`);
    const rawPath = path.join(this.dir, `${label}-raw.bin`);
    const enrichedPath = path.join(this.dir, `${label}-enriched.txt`);
    const metaPath = path.join(this.dir, `${label}-meta.json`);

    const readableHeader = [
      '# iFood QR — debug de impressao',
      `# Source: ${source}`,
      `# Timestamp: ${new Date().toISOString()}`,
      `# Bytes RAW: ${Buffer.byteLength(rawInvoice, 'latin1')}`,
      `# DisplayId extraido: ${displayId || 'N/A'}`,
      `# Modificado (QR injetado): ${detail.modified}`,
      `# PDF mode: ${detail.pdfMode}`,
      detail.payload ? `# Payload QR: ${detail.payload}` : '# Payload QR: N/A',
      '',
      '--- TEXTO LEGIVEL (strip ESC/POS) ---',
      '',
      readable || '(vazio — possivel binario puro)',
      '',
      '--- FIM ---',
    ].join('\n');

    fs.writeFileSync(readablePath, readableHeader, 'utf-8');
    fs.writeFileSync(rawPath, Buffer.from(rawInvoice, 'latin1'));

    const enrichedReadable = stripEscPosToText(detail.invoice);
    const enrichedHeader = [
      '# iFood QR — o que sera/enviou para impressora',
      `# Modificado: ${detail.modified}`,
      detail.payload ? `# Payload: ${detail.payload}` : '',
      '',
      '--- ENRIQUECIDO (texto legivel) ---',
      '',
      enrichedReadable || detail.invoice.slice(0, 5000),
      '',
    ]
      .filter(Boolean)
      .join('\n');

    fs.writeFileSync(enrichedPath, enrichedHeader, 'utf-8');

    const meta = {
      source,
      timestamp: new Date().toISOString(),
      rawBytes: Buffer.byteLength(rawInvoice, 'latin1'),
      displayIdExtracted: displayId,
      modified: detail.modified,
      pdfMode: detail.pdfMode,
      payload: detail.payload,
      order: detail.order,
      previewPath: detail.previewPath,
      readablePreview: readable.slice(0, 2000),
      ...extra,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    const entry: PrintDebugEntry = {
      timestamp: meta.timestamp,
      source,
      rawBytes: meta.rawBytes as number,
      displayIdExtracted: displayId,
      readablePath,
      rawPath,
      enrichedPath,
      metaPath,
      modified: detail.modified,
      payload: detail.payload,
    };

    this.lastEntry = entry;
    this.logger.info('[PRINT DEBUG] Dump salvo', {
      dir: this.dir,
      readable: readablePath,
      enriched: enrichedPath,
      modified: detail.modified,
      displayId,
    });

    return entry;
  }
}

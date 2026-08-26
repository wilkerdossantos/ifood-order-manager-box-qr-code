import type { OrderData } from '../config/types.js';

interface DedupEntry {
  at: number;
}

/**
 * Evita logs e ingestões duplicadas do mesmo pedido em janela curta
 * (Network CDP + fetch hook + poll).
 */
export class IngestDeduper {
  private seen = new Map<string, DedupEntry>();

  constructor(private windowMs = 10_000) {}

  /** Retorna true se este ingest deve ser processado (primeira vez na janela). */
  shouldIngest(orders: OrderData[]): boolean {
    if (orders.length === 0) return false;

    const now = Date.now();
    this.prune(now);

    const key = this.buildKey(orders);
    if (!key) return true;

    const prev = this.seen.get(key);
    if (prev && now - prev.at < this.windowMs) {
      return false;
    }

    this.seen.set(key, { at: now });
    return true;
  }

  reset(): void {
    this.seen.clear();
  }

  private buildKey(orders: OrderData[]): string {
    const primary = orders[0];
    if (!primary) return '';
    return `${primary.orderId || ''}|${primary.displayId || ''}|${primary.merchantId || ''}`;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.seen) {
      if (now - entry.at > this.windowMs * 2) {
        this.seen.delete(key);
      }
    }
  }
}

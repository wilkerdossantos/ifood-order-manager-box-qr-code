import fs from 'node:fs';
import path from 'node:path';

import type { CacheStats, OrderData, PrintMeta } from '../config/types.js';
import { stripEscPosToText } from '../qr/escpos.js';
import {
  clean,
  displayAliases,
  extractDisplayIdFromInvoice,
  first,
  isInternalId,
  mapOrderType,
  normalizeMerchantName,
  UUID,
} from '../utils/strings.js';

type OrderRecord = OrderData & { capturedAt?: string };

interface PersistedCache {
  orders: OrderRecord[];
  merchants: Record<string, string>;
  updatedAt: string;
}

export interface OrderCacheOptions {
  cacheMaxAgeHours?: number;
  printCacheWaitMs?: number;
  onPersistError?: (error: unknown) => void;
}

export class OrderCache {
  private orderCache = new Map<string, OrderRecord>();
  private merchantRegistry = new Map<string, string>();
  private cachePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private cacheMaxAgeHours: number;
  private printCacheWaitMs: number;
  private onPersistError?: (error: unknown) => void;

  constructor(cachePath: string, options: OrderCacheOptions = {}) {
    this.cachePath = cachePath;
    this.cacheMaxAgeHours = options.cacheMaxAgeHours ?? 24;
    this.printCacheWaitMs = options.printCacheWaitMs ?? 2000;
    this.onPersistError = options.onPersistError;
    this.loadFromDisk();
  }

  getStats(): CacheStats {
    return {
      orderKeys: this.orderCache.size,
      uniqueOrders: this.uniqueOrdersList().length,
      merchants: [...this.merchantRegistry.keys()].filter((k) => !k.startsWith('id:')).length,
      lastUpdated: this.cachePath && fs.existsSync(this.cachePath)
        ? fs.statSync(this.cachePath).mtime.toISOString()
        : undefined,
    };
  }

  getOrder(displayId: string): OrderRecord | null {
    return this.lookupOrderInCache(displayId);
  }

  getAllOrders(): OrderRecord[] {
    return this.uniqueOrdersList();
  }

  ingestPayload(payload: unknown, depth = 0, context: Record<string, unknown> = {}): OrderData[] {
    const captured: OrderData[] = [];
    this.ingestPayloadInternal(payload, depth, context, captured);
    if (captured.length > 0) {
      this.consolidateCache();
      this.schedulePersist();
    }
    return captured;
  }

  ingestPrintPackage(parsed: Record<string, unknown>): void {
    if (!parsed || typeof parsed !== 'object') return;
    const ctx = {
      merchantId: first(parsed.merchantId, parsed.storeId, (parsed.merchant as Record<string, unknown>)?.id, (parsed.store as Record<string, unknown>)?.id),
      merchant: parsed.merchant || parsed.store,
    };
    this.registerMerchant(parsed.merchant);
    this.registerMerchant(parsed.store);
    if (parsed.order) this.ingestPayload(parsed.order, 0, ctx);
    if (parsed.orders) this.ingestPayload(parsed.orders, 0, ctx);
    if (parsed.orderId || parsed.merchantId) {
      const order = (parsed.order || {}) as Record<string, unknown>;
      this.rememberOrder({
        orderId: first(parsed.orderId, order.id, order.orderId),
        displayId: this.extractDisplayId(order),
        merchantId: String(ctx.merchantId || ''),
        orderType: mapOrderType(String(order.orderType || order.type || '')),
        pickupCode: first(order.pickupCode, (order.delivery as Record<string, unknown>)?.pickupCode),
      });
    }
    this.consolidateCache();
    this.schedulePersist();
  }

  findOrderInInvoice(invoice: string, printMeta: PrintMeta = {}): OrderRecord | null {
    this.consolidateCache();

    const displayId = extractDisplayIdFromInvoice(invoice);
    if (displayId) {
      const cached = this.lookupOrderInCache(displayId);
      if (cached) {
        return this.enrichOrderData(cached, invoice);
      }
    }

    if (printMeta.orderId) {
      const byId =
        this.orderCache.get(`id:${printMeta.orderId}`) ||
        this.lookupOrderInCache(printMeta.orderId);
      if (byId) {
        return this.enrichOrderData(byId, invoice);
      }
    }

    const uniqueOrders = new Map<string, OrderRecord>();
    for (const order of this.uniqueOrdersList()) {
      if (order?.displayId || order?.orderId) {
        uniqueOrders.set(order.orderId || order.displayId, order);
      }
    }
    if (uniqueOrders.size === 1) {
      const only = uniqueOrders.values().next().value;
      return only ? this.enrichOrderData(only, invoice) : null;
    }

    return null;
  }

  extractOrderFromInvoiceText(invoice: string): OrderRecord | null {
    const displayId = extractDisplayIdFromInvoice(invoice);
    if (!displayId) return null;

    const raw = String(invoice || '');
    let orderType = 'NÃO INFORMADO';
    if (/SERVIR\s+NA\s+MESA|DINE[\s_-]?IN/i.test(raw)) orderType = 'DINE_IN';
    else if (/RETIRADA|TAKEOUT|PICKUP/i.test(raw)) orderType = 'RETIRADA';
    else if (/DELIVERY|ENTREGA/i.test(raw)) orderType = 'DELIVERY';

    let pickupCode = '';
    const pickupMatch = raw.match(/C[ÓO]DIGO\s+DE\s+COLETA[^:]*:\s*([^\n]+)/i);
    if (pickupMatch) {
      const code = clean(pickupMatch[1]);
      if (code && !/INDISPON[IÍ]VEL/i.test(code)) pickupCode = code;
    }

    const merchantId = this.extractMerchantIdFromInvoice(invoice);
    return {
      displayId,
      merchantId,
      pickupCode: pickupCode || 'N/A',
      orderType,
      orderId: 'N/A',
    };
  }

  async resolveOrderForPrint(
    invoice: string,
    printMeta: PrintMeta = {},
    waitMs?: number,
  ): Promise<OrderRecord | null> {
    const effectiveWait = waitMs ?? this.printCacheWaitMs;
    if (printMeta && '_parsed' in printMeta) {
      this.ingestPrintPackage(printMeta._parsed as Record<string, unknown>);
    }
    this.consolidateCache();

    let data = this.findOrderInInvoice(invoice, printMeta);
    if (!data) {
      const plain = stripEscPosToText(invoice);
      if (plain && plain !== invoice) {
        data = this.findOrderInInvoice(plain, printMeta);
        if (!data) data = this.extractOrderFromInvoiceText(plain);
      }
    }
    if (!data) data = this.extractOrderFromInvoiceText(invoice);
    if (!data) {
      const plain = stripEscPosToText(invoice);
      if (plain && plain !== invoice) {
        data = this.extractOrderFromInvoiceText(plain);
      }
    }
    if (!data) return null;

    if (!data.merchantId) {
      const displayId = data.displayId || extractDisplayIdFromInvoice(invoice);
      const deadline = Date.now() + effectiveWait;
      while (!data.merchantId && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 40));
        this.consolidateCache();
        const refreshed = this.lookupOrderInCache(displayId);
        if (refreshed) data = this.mergeOrder(data, refreshed);
      }
    }

    return this.enrichOrderData(data, invoice);
  }

  registerMerchant(entity: unknown): void {
    if (!entity || typeof entity !== 'object') return;
    const e = entity as Record<string, unknown>;
    const id = first(e.id, e.merchantId, e.storeId);
    const name = first(
      e.name,
      e.tradingName,
      e.corporateName,
      e.shortName,
      e.businessName,
    );
    if (!id || !UUID.test(id)) return;
    this.merchantRegistry.set(`id:${id}`, id);
    if (name) this.merchantRegistry.set(normalizeMerchantName(name), id);
  }

  flush(): void {
    this.persistToDisk();
  }

  private ingestPayloadInternal(
    payload: unknown,
    depth: number,
    context: Record<string, unknown>,
    captured: OrderData[],
  ): void {
    if (!payload || depth > 8) return;
    if (Array.isArray(payload)) {
      payload.forEach((item) => this.ingestPayloadInternal(item, depth + 1, context, captured));
      return;
    }
    if (typeof payload !== 'object') return;

    const p = payload as Record<string, unknown>;
    this.registerMerchant(p.merchant);
    this.registerMerchant(p.store);
    if (p.merchants) this.ingestPayloadInternal(p.merchants, depth + 1, context, captured);
    if (p.stores) this.ingestPayloadInternal(p.stores, depth + 1, context, captured);

    const nextContext = {
      merchantId: first(p.merchantId, p.storeId, context.merchantId),
      merchant: p.merchant || p.store || context.merchant,
    };

    const direct = this.normalise(p, nextContext);
    if (direct) {
      this.rememberOrder(direct);
      captured.push(direct);
    }

    for (const key of ['events', 'orders', 'items', 'results', 'content', 'data', 'order']) {
      if (p[key] && key !== 'order') {
        this.ingestPayloadInternal(p[key], depth + 1, nextContext, captured);
      }
    }

    if (p.event) this.ingestPayloadInternal(p.event, depth + 1, nextContext, captured);
    if (p.body) this.ingestPayloadInternal(p.body, depth + 1, nextContext, captured);
    if (p.order) this.ingestPayloadInternal({ order: p.order }, depth + 1, nextContext, captured);
  }

  private normalise(value: Record<string, unknown>, context: Record<string, unknown> = {}): OrderRecord | null {
    const order =
      (value.order as Record<string, unknown>) ||
      ((value.payload as Record<string, unknown>)?.order as Record<string, unknown>) ||
      ((value.data as Record<string, unknown>)?.order as Record<string, unknown>) ||
      (value.data as Record<string, unknown>) ||
      (value.payload as Record<string, unknown>) ||
      value;
    if (!order || typeof order !== 'object') return null;

    const delivery =
      (order.delivery as Record<string, unknown>) ||
      (order.fulfillment as Record<string, unknown>) ||
      (order.shipping as Record<string, unknown>) ||
      {};
    const merchant =
      (order.merchant as Record<string, unknown>) ||
      (order.store as Record<string, unknown>) ||
      (value.merchant as Record<string, unknown>) ||
      (value.store as Record<string, unknown>) ||
      (context.merchant as Record<string, unknown>) ||
      {};
    this.registerMerchant(merchant);
    this.registerMerchant(value.merchant);
    this.registerMerchant(value.store);

    const rawType = first(
      order.orderType,
      order.type,
      order.salesChannel,
      delivery.type,
      order.deliveryType,
    );
    const result: OrderRecord = {
      merchantId: first(
        merchant.id,
        merchant.merchantId,
        order.merchantId,
        order.storeId,
        value.merchantId,
        value.storeId,
        context.merchantId,
      ),
      displayId: this.extractDisplayId(order),
      pickupCode: first(
        delivery.pickupCode,
        delivery.pickup_code,
        order.pickupCode,
        order.collectionCode,
        order.partnerPickupCode,
      ),
      orderType: mapOrderType(String(rawType)),
      orderId: this.extractOrderId(order),
    };
    // Só é pedido se houver um displayId real (não-UUID, não-chunk). Isso
    // descarta config de merchant, shipping e chunks webpack que hoje viram
    // "pedido" porque têm um `id` qualquer.
    return result.displayId ? result : null;
  }

  private extractDisplayId(order: Record<string, unknown>): string {
    const explicit = first(
      order.displayId,
      order.display_id,
      order.orderNumber,
      order.shortId,
      order.shortReference,
      order.localizer,
      order.number,
    );
    // displayId real nunca é um UUID nem um identificador de chunk webpack
    // (orderDisplay_... / partnersOrderPrep_...). UUID pertence a orderId.
    if (explicit) return this.isValidDisplayId(explicit) ? explicit : '';
    const rawId = clean(order.id);
    return rawId && this.isValidDisplayId(rawId) && !isInternalId(rawId) ? rawId : '';
  }

  private isValidDisplayId(value: string): boolean {
    const v = clean(value);
    if (!v) return false;
    if (UUID.test(v)) return false; // UUID é orderId, não displayId
    if (/[_/]/.test(v)) return false; // chunk webpack (orderDisplay_...)
    return true;
  }

  private extractOrderId(order: Record<string, unknown>): string {
    const explicit = first(order.orderId, order.order_id, order.uuid);
    if (explicit) return explicit;
    const rawId = clean(order.id);
    return rawId || '';
  }

  private mergeOrder(existing: OrderRecord | undefined, incoming: OrderRecord): OrderRecord {
    if (!existing) return incoming;
    return {
      ...existing,
      ...incoming,
      merchantId: incoming.merchantId || existing.merchantId,
      pickupCode: incoming.pickupCode || existing.pickupCode,
      orderType: incoming.orderType !== 'NÃO INFORMADO' ? incoming.orderType : existing.orderType,
      orderId: incoming.orderId || existing.orderId,
      displayId: incoming.displayId || existing.displayId,
      capturedAt: existing.capturedAt || incoming.capturedAt,
    };
  }

  private rememberOrder(data: Partial<OrderRecord>, options: { skipPersist?: boolean } = {}): void {
    if (!data?.displayId && !data?.orderId) return;

    const canonical: OrderRecord = {
      merchantId: data.merchantId || '',
      displayId: data.displayId || '',
      pickupCode: data.pickupCode || '',
      orderType: data.orderType || 'NÃO INFORMADO',
      orderId: data.orderId || '',
      capturedAt: data.capturedAt || new Date().toISOString(),
    };

    const save = (key: string, value: OrderRecord) => {
      if (!key) return;
      const existing = this.orderCache.get(key);
      const merged = this.mergeOrder(existing, value);
      if (!merged.capturedAt) merged.capturedAt = canonical.capturedAt;
      this.orderCache.set(key, merged);
    };

    for (const alias of displayAliases(canonical.displayId)) save(alias, canonical);
    if (canonical.orderId) {
      save(`id:${canonical.orderId}`, canonical);
      if (!isInternalId(canonical.orderId)) {
        for (const alias of displayAliases(canonical.orderId)) save(alias, canonical);
      }
    }

    if (!options.skipPersist) {
      this.schedulePersist();
    }
  }

  private consolidateCache(): void {
    const byOrderId = new Map<string, OrderRecord>();
    const byDisplayId = new Map<string, OrderRecord>();

    for (const order of this.orderCache.values()) {
      if (order.orderId) {
        const existing = byOrderId.get(order.orderId);
        byOrderId.set(order.orderId, existing ? this.mergeOrder(existing, order) : order);
      }
      if (order.displayId) {
        for (const alias of displayAliases(order.displayId)) {
          const existing = byDisplayId.get(alias);
          byDisplayId.set(alias, existing ? this.mergeOrder(existing, order) : order);
        }
      }
    }

    const mergedGroups = new Map<string, OrderRecord>();
    for (const order of byOrderId.values()) {
      const key = `${order.orderId}|${order.displayId}`;
      mergedGroups.set(key, order);
    }
    for (const order of byDisplayId.values()) {
      const match = [...mergedGroups.values()].find(
        (o) =>
          (o.orderId && o.orderId === order.orderId) ||
          (o.displayId &&
            order.displayId &&
            displayAliases(o.displayId).some((a) => displayAliases(order.displayId).includes(a))),
      );
      if (match) {
        mergedGroups.set(`${match.orderId}|${match.displayId}`, this.mergeOrder(match, order));
      } else {
        mergedGroups.set(`${order.orderId}|${order.displayId}`, order);
      }
    }

    for (const merged of mergedGroups.values()) {
      this.rememberOrder(merged, { skipPersist: true });
    }
  }

  private uniqueOrdersList(): OrderRecord[] {
    const seen = new Set<string>();
    const orders: OrderRecord[] = [];
    for (const order of this.orderCache.values()) {
      const key = `${order.orderId || ''}|${order.displayId || ''}|${order.merchantId || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      orders.push(order);
    }
    return orders;
  }

  private orderMatchesLookup(order: OrderRecord, lookupId: string): boolean {
    if (!order || !lookupId) return false;
    const key = clean(lookupId);
    const stripped = key.replace(/^0+/, '') || key;
    const fields = [order.displayId, order.orderId].filter(Boolean).map(clean);
    return fields.some(
      (field) =>
        field === key || field === stripped || field.replace(/^0+/, '') === stripped,
    );
  }

  private lookupOrderInCache(displayId: string): OrderRecord | null {
    if (!displayId) return null;
    for (const alias of displayAliases(displayId)) {
      if (this.orderCache.has(alias)) return this.orderCache.get(alias)!;
      if (this.orderCache.has(`id:${alias}`)) return this.orderCache.get(`id:${alias}`)!;
    }
    for (const order of this.uniqueOrdersList()) {
      if (this.orderMatchesLookup(order, displayId)) return order;
    }
    return null;
  }

  private extractMerchantIdFromInvoice(invoice: string): string {
    const lines = String(invoice).split('\n').map(clean).filter(Boolean);
    const skip =
      /^(ifood|totem|expedi[cç][aã]o|pedido|data:|entrega|servir|primeiro|itens|────|[-─]+)/i;
    for (const line of lines.slice(0, 12)) {
      if (skip.test(line) || line.length < 3) continue;
      const key = normalizeMerchantName(line);
      if (this.merchantRegistry.has(key)) return this.merchantRegistry.get(key)!;
      for (const [name, id] of this.merchantRegistry) {
        if (name.startsWith('id:')) continue;
        if (key.length >= 4 && (key.includes(name) || name.includes(key))) return id;
      }
    }
    return '';
  }

  private enrichOrderData(data: OrderRecord, invoice: string): OrderRecord {
    const merchantId = data.merchantId || this.extractMerchantIdFromInvoice(invoice);
    return merchantId ? { ...data, merchantId } : data;
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistToDisk(), 500);
  }

  private persistToDisk(): void {
    try {
      const orders = this.purgeExpiredOrders(this.uniqueOrdersList());
      const data: PersistedCache = {
        orders,
        merchants: Object.fromEntries(this.merchantRegistry),
        updatedAt: new Date().toISOString(),
      };
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      if (this.onPersistError) {
        this.onPersistError(err);
      } else {
        console.warn('[OrderCache] Falha ao persistir cache:', err);
      }
    }
  }

  private purgeExpiredOrders(orders: OrderRecord[]): OrderRecord[] {
    if (!this.cacheMaxAgeHours || this.cacheMaxAgeHours <= 0) return orders;

    const maxAgeMs = this.cacheMaxAgeHours * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;

    return orders.filter((order) => {
      if (!order.capturedAt) return true;
      const at = Date.parse(order.capturedAt);
      return Number.isNaN(at) || at >= cutoff;
    });
  }

  private loadFromDisk(): void {
    if (!this.cachePath || !fs.existsSync(this.cachePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8')) as PersistedCache;
      for (const order of data.orders || []) this.rememberOrder(order);
      for (const [key, value] of Object.entries(data.merchants || {})) {
        this.merchantRegistry.set(key, value);
      }
      this.consolidateCache();
    } catch {
      // ignore corrupt cache
    }
  }
}

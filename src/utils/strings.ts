export const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function first(...values: unknown[]): string {
  return values.map((v) => clean(v)).find(Boolean) || '';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function displayAliases(value: string): string[] {
  const key = clean(value);
  if (!key) return [];
  const stripped = key.replace(/^0+/, '') || key;
  return [...new Set([key, stripped, stripped.padStart(4, '0')])];
}

export function isInternalId(value: string): boolean {
  const id = clean(value);
  return /^\d{6,}$/.test(id);
}

export function normalizeMerchantName(name: string): string {
  return clean(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function mapOrderType(rawType: string): string {
  const type = String(rawType || '').toUpperCase();
  if (/PICKUP|TAKEOUT|RETIRADA/.test(type)) return 'RETIRADA';
  if (/DELIVERY|ENTREGA/.test(type)) return 'DELIVERY';
  if (/DINE|MESSA|MESA/.test(type)) return 'DINE_IN';
  return type || 'NÃO INFORMADO';
}

export function shouldIngestUrl(url: string, pattern?: string): boolean {
  const regex = new RegExp(pattern || '/orders?(?:\\/|\\?|$)|events:polling|expedition|merchant|store|totem', 'i');
  return regex.test(url);
}

export function extractDisplayIdFromInvoice(invoice: string): string {
  const raw = String(invoice || '');
  return (
    raw.match(/PEDIDO:\s*#?\s*([A-Z0-9-]+)/i)?.[1] ||
    clean(raw).match(/(?:pedido|order)\s*#?\s*([A-Z0-9-]+)/i)?.[1] ||
    ''
  );
}

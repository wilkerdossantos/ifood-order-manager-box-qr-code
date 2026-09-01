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
  const regex = new RegExp(pattern || '/orders?(?:\\/|\\?|$)|events:polling', 'i');
  return regex.test(url);
}

export function extractDisplayIdFromInvoice(invoice: string): string {
  const raw = String(invoice || '');

  // Âncora o rótulo no início da linha e exige token de 3+ chars para evitar
  // falsos positivos como "Valor total do pedido: R$ 0,00" (que capturava "R").
  const labeled =
    raw.match(/^\s*(?:N[UÚ]MERO\s+DO\s+PEDIDO|PEDIDO)\s*:?\s*#?\s*([A-Z0-9-]{3,})/im)?.[1] ||
    raw.match(/(?:ORDER\s+NUMBER)\s*:?\s*#?\s*([0-9]{3,8})/i)?.[1] ||
    clean(raw).match(/(?:pedido|order)\s*#?\s*([A-Z0-9-]{3,})/i)?.[1];

  if (labeled) return labeled;

  const hashLine = raw.match(/^\s*#\s*([0-9]{3,8})\s*$/m)?.[1];
  if (hashLine) return hashLine;

  // Gestor Totem (EXPEDICAO): o shortReference (4-8 digitos) fica logo apos o
  // cabecalho EXPEDICAO, cercado por residuo ESC/POS ("3B!3B   0270"). Nao e
  // uma linha numerica limpa, entao o loop abaixo nao o pega.
  const expedicao = raw.match(/EXPEDI[CÇ][AÃ]O\s*[^\n]*\n?[\s\S]{0,160}?([0-9]{4,8})(?!\d)/);
  if (expedicao) return expedicao[1];

  // Gestor Desktop v2: shortReference aparece sozinho (4-8 digitos), entre linhas decorativas.
  const stopSection = /^(ITENS|ITEMS|DATA:|ENTREGA|RETIRADA|SERVIR|RESUMO|TOTAL)/i;
  const ignoreLine = /^(ifood|iFood)$/i;
  const decorative = /^[-─\s]+$/;
  for (const line of raw.split('\n')) {
    const trimmed = clean(line);
    if (!trimmed || decorative.test(trimmed) || ignoreLine.test(trimmed)) continue;
    if (stopSection.test(trimmed)) break;
    if (/^[0-9]{4,8}$/.test(trimmed)) return trimmed;
  }

  return '';
}

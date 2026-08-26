export function isPdfPrinterName(printerName: string): boolean {
  const upper = String(printerName || '').toUpperCase();
  return upper.includes('PDF') || upper === 'PDF';
}

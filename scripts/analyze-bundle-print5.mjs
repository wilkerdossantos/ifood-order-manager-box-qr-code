import fs from 'node:fs';

const d = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, 'utf8');

// Find onPrintOrder saga/effect - module with eX.onPrintOrder
for (const kw of ['onPrintOrder', 'printOrderSaga', 'handlePrintOrder', 'getPrintingEvent', 'isPrinterWidgetRunning', 'PRINTER_WIDGET', 'ELECTRON_PRINTER_VERSION', 'electronPrinterVersion']) {
  let idx = 0;
  let count = 0;
  while ((idx = d.indexOf(kw, idx)) >= 0 && count < 8) {
    const ctx = d.slice(Math.max(0, idx - 80), idx + 350);
    // Filter for routing logic
    if (kw === 'onPrintOrder' || kw.includes('Widget') || kw.includes('PRINTER') || kw.includes('electronPrinter')) {
      console.log(`\n=== ${kw} @ ${idx} ===`);
      console.log(ctx);
      count++;
    }
    idx++;
  }
}

// Find saga that calls Ru or ElectronActions.printInvoice
const patterns = ['54875', 'ElectronActions.printInvoice', '.Ru(', 'printInvoiceVia', 'printViaWidget', 'printViaElectron'];
for (const pat of patterns) {
  let idx = 0;
  let n = 0;
  while ((idx = d.indexOf(pat, idx)) >= 0 && n < 5) {
    console.log(`\n=== ${pat} @ ${idx} ===`);
    console.log(d.slice(Math.max(0, idx - 200), idx + 500));
    idx++;
    n++;
  }
}

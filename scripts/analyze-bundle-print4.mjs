import fs from 'node:fs';

const d = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, 'utf8');

// Module 54875 exports Ru - find the Ru function definition
const modStart = d.indexOf('54875:(e,t,a)=>');
if (modStart >= 0) {
  console.log('=== Module 54875 (printer_widget) ===');
  console.log(d.slice(modStart, modStart + 3500));
}

// Find Ru usage in print flow
let idx = 0;
let n = 0;
while ((idx = d.indexOf('Ru(', idx)) >= 0 && n < 15) {
  const ctx = d.slice(Math.max(0, idx - 100), idx + 200);
  if (/print|invoice|widget|electron/i.test(ctx)) {
    console.log(`\n=== Ru( @ ${idx} ===`);
    console.log(ctx);
  }
  idx++;
  n++;
}

// Find getPrintingEvent and ElectronActions print flow
idx = d.indexOf('getPrintingEvent');
if (idx >= 0) {
  console.log('\n=== ElectronActions print area ===');
  console.log(d.slice(idx - 500, idx + 2000));
}

// Search ELECTRON_PRINTER in entire bundle with different patterns
for (const kw of ['electronPrinter', 'ELECTRON_PRINTER', 'printerVersion', 'DESKTOP_FLAGS', 'getDesktopFlags', 'desktopFlags']) {
  idx = d.indexOf(kw);
  if (idx >= 0) {
    console.log(`\n=== ${kw} @ ${idx} ===`);
    console.log(d.slice(Math.max(0, idx - 200), idx + 400));
  }
}

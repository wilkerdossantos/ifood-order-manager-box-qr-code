import fs from 'node:fs';

const d = fs.readFileSync(`${process.env.TEMP}/gestor-949.js`, 'utf8');

// Find all printOrder send patterns
let idx = 0;
let n = 0;
while ((idx = d.indexOf('printOrder', idx)) >= 0 && n < 20) {
  const ctx = d.slice(Math.max(0, idx - 120), idx + 200);
  if (ctx.includes('send') || ctx.includes('invoke') || ctx.includes('exec')) {
    console.log(`\n=== printOrder @ ${idx} ===`);
    console.log(ctx);
  }
  idx++;
  n++;
}

// Search for version 2 printer routing
for (const kw of ['"2"', 'version:2', 'printerVersion', 'electronPrinter', 'thermalPrinter', 'printInvoice', 'printOrderReply']) {
  idx = 0;
  n = 0;
  while ((idx = d.indexOf(kw, idx)) >= 0 && n < 4) {
    const ctx = d.slice(Math.max(0, idx - 150), idx + 250);
    if (/print|invoice|thermal|ipc|exec/i.test(ctx)) {
      console.log(`\n=== ${kw} @ ${idx} ===`);
      console.log(ctx);
      n++;
    }
    idx++;
  }
}

// Find function that calls u.send with invoice
const sendPatterns = ['u.send(A,', 'u.send("printOrder"', '.send(A,', 'ipcRenderer.send(A'];
for (const pat of sendPatterns) {
  idx = d.indexOf(pat);
  if (idx >= 0) {
    console.log(`\n=== FOUND ${pat} @ ${idx} ===`);
    console.log(d.slice(Math.max(0, idx - 300), idx + 600));
  }
}
